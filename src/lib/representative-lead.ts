import { prisma } from "@/lib/prisma";
import { normalizeLocalPhone } from "@/lib/representative-application";
import { createWithGeneratedCode } from "@/lib/representative-code";
import { phoneVariants } from "@/lib/duplicate-detection";

/**
 * Lead capture for representatives.
 *
 * A lead is a producer a representative has spoken to but who has not yet
 * registered. Lead rows are what the referral flow later matches against: when
 * someone arrives via `/r/<code>` and registers, `producer-registration` looks
 * up an existing lead by phone and links the two. Without a way to create
 * leads, that lookup can never match, so the rep's referral would be attributed
 * purely by cookie and a producer they entered by hand would be invisible to
 * them.
 */

export class LeadValidationError extends Error {
  field: string;
  constructor(field: string, message: string) {
    super(message);
    this.name = "LeadValidationError";
    this.field = field;
  }
}

/**
 * Statuses the representative may set by hand.
 *
 * Anything downstream of registration is decided by the payment and approval
 * flow, not by the person who made the introduction. Letting a rep type
 * "APPROVED" on their own lead would let them manufacture the appearance of a
 * conversion they did not actually make.
 */
export const REP_EDITABLE_LEAD_STATUSES = [
  "NEW",
  "CONTACTED",
  "INTERESTED",
  "REGISTRATION_STARTED",
  "NOT_INTERESTED",
  "DUPLICATE",
] as const;

const REP_EDITABLE_SET = new Set<string>(REP_EDITABLE_LEAD_STATUSES);

/** True when a lead's status is machine-owned and must not be hand-edited. */
export function isSystemOwnedLeadStatus(status: string): boolean {
  return !REP_EDITABLE_SET.has(status);
}

export type CreateLeadInput = {
  contactName: string;
  phone: string;
  whatsapp?: string | null;
  email?: string | null;
  district: string;
  area?: string | null;
  productCategory?: string | null;
  notes?: string | null;
  producerName?: string | null;
};

/** Field-level validation, mirrored by the caller for a friendly response. */
export function validateLeadInput(input: CreateLeadInput): CreateLeadInput {
  const contactName = input.contactName?.trim() ?? "";
  if (contactName.length < 2) {
    throw new LeadValidationError("contactName", "Please enter the contact's name.");
  }

  const phone = normalizeLocalPhone(input.phone);
  if (!phone) {
    throw new LeadValidationError("phone", "Please enter a valid 10-digit mobile number.");
  }

  const whatsapp = input.whatsapp ? normalizeLocalPhone(input.whatsapp) : null;
  if (input.whatsapp && !whatsapp) {
    throw new LeadValidationError("whatsapp", "Please enter a valid 10-digit mobile number.");
  }

  const district = input.district?.trim() ?? "";
  if (!district) {
    throw new LeadValidationError("district", "Please select a district.");
  }

  return {
    contactName,
    phone,
    whatsapp,
    email: input.email?.trim() || null,
    district,
    area: input.area?.trim() || null,
    productCategory: input.productCategory?.trim() || null,
    notes: input.notes?.trim() || null,
    producerName: input.producerName?.trim() || null,
  };
}

/**
 * Flags a lead that is probably someone who already joined.
 *
 * This is a *suspect* flag for the rep to see, not a rejection: the producer may
 * legitimately be re-registering, or may have registered under a different
 * number. We never silently drop the lead, because a rep who entered a real
 * prospect and then saw nothing would have no way to tell that from a bug.
 */
async function flagDuplicates(phone: string) {
  // Matched on phone only, which is what `producer-registration` actually
  // matches on when it later links a lead to a real registration. Producer has
  // no email column, so matching on one here would invent a duplicate the rest
  // of the system cannot agree with.
  //
  // `Producer.phone` is free text and the existing rows are genuinely
  // inconsistent — the seeded producers hold "+947…", "07…" and "074…" side by
  // side — so comparing the lead's normalised number for equality finds nothing.
  // `phoneVariants` enumerates every spelling of one number, which is what makes
  // this check work against real data rather than only against rows this module
  // wrote itself.
  const producer = await prisma.producer.findFirst({
    where: { phone: { in: phoneVariants(phone) } },
    select: { id: true },
  });

  if (producer) {
    return { duplicateSuspect: true, duplicateOfProducerId: producer.id };
  }

  // Same lead already in the system, under any representative.
  const existingLead = await prisma.representativeLead.findFirst({
    where: { phone },
    select: { id: true, representativeId: true },
  });

  if (existingLead) {
    return {
      duplicateSuspect: true,
      duplicateNote: "A lead with this number already exists in the system.",
    };
  }

  return { duplicateSuspect: false };
}

export async function createLeadForRepresentative(
  representativeId: string,
  rawInput: CreateLeadInput
) {
  const input = validateLeadInput(rawInput);
  const duplicate = await flagDuplicates(input.phone);

  return createWithGeneratedCode("lead", async (tx, leadCode) =>
    tx.representativeLead.create({
      data: {
        leadCode,
        representativeId,
        contactName: input.contactName,
        phone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        district: input.district,
        area: input.area,
        productCategory: input.productCategory,
        notes: input.notes,
        producerName: input.producerName,
        ...duplicate,
      },
      select: {
        id: true,
        leadCode: true,
        contactName: true,
        phone: true,
        district: true,
        status: true,
        duplicateSuspect: true,
        duplicateNote: true,
        createdAt: true,
      },
    })
  );
}

/**
 * Moves a lead along. Refuses to touch a status the payment flow owns, and
 * stamps `contactedAt` the first time a rep marks a lead as contacted so the
 * admin side has a real response-time signal.
 */
export async function updateLeadForRepresentative(
  representativeId: string,
  leadId: string,
  changes: { status?: string; notes?: string; area?: string; productCategory?: string }
) {
  const lead = await prisma.representativeLead.findFirst({
    where: { id: leadId, representativeId },
    select: { id: true, status: true, statusLocked: true, contactedAt: true },
  });

  if (!lead) {
    throw new LeadValidationError("leadId", "That lead could not be found.");
  }

  const data: Record<string, unknown> = {};

  if (changes.status !== undefined && changes.status !== lead.status) {
    if (lead.statusLocked || isSystemOwnedLeadStatus(lead.status)) {
      throw new LeadValidationError(
        "status",
        `This lead is at "${lead.status}", which is decided by the registration and payment process, so it cannot be changed here.`
      );
    }
    if (!REP_EDITABLE_SET.has(changes.status)) {
      throw new LeadValidationError("status", "That is not a status you can set.");
    }
    data.status = changes.status;
    if (changes.status === "CONTACTED" && !lead.contactedAt) {
      data.contactedAt = new Date();
    }
  }

  if (changes.notes !== undefined) data.notes = changes.notes.trim() || null;
  if (changes.area !== undefined) data.area = changes.area.trim() || null;
  if (changes.productCategory !== undefined) {
    data.productCategory = changes.productCategory.trim() || null;
  }

  if (Object.keys(data).length === 0) return lead;

  return prisma.representativeLead.update({
    where: { id: lead.id },
    data,
    select: { id: true, status: true, notes: true, area: true, productCategory: true },
  });
}

/** Counts for the rep's dashboard tiles. */
export async function getLeadCounts(representativeId: string) {
  const grouped = await prisma.representativeLead.groupBy({
    by: ["status"],
    where: { representativeId },
    _count: { _all: true },
  });

  const byStatus: Record<string, number> = {};
  for (const row of grouped) byStatus[row.status] = row._count._all;

  return {
    byStatus,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
    open: (byStatus.NEW ?? 0) + (byStatus.CONTACTED ?? 0) + (byStatus.INTERESTED ?? 0),
    converted: (byStatus.REGISTERED ?? 0) + (byStatus.PAYMENT_CONFIRMED ?? 0) + (byStatus.APPROVED ?? 0),
  };
}
