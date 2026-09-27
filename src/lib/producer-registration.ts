import { prisma } from "@/lib/prisma";
import {
  getSettings,
  isFeeRequired,
} from "@/lib/representative-settings";
import {
  checkProducerDuplicates,
  checkSelfReferral,
  type DuplicateResult,
} from "@/lib/duplicate-detection";
import { canConvertReferrals } from "@/lib/representative-guard";
import type { ResolvedReferral } from "@/lib/referral-cookie";
import { createNotification } from "@/lib/notifications";
import { recordAudit } from "@/lib/audit";

/**
 * Producer registration with referral attribution.
 *
 * Everything that has to stay consistent is done in ONE transaction:
 *   Producer + ProducerReferral + ProducerRegistrationPayment + first Product
 *   + the lead status that closed.
 *
 * Doing these as separate writes is how a producer ends up approved with no
 * payment row (so no fee is enforced), or with a referral that exists but no
 * payment, or with a payment whose feeRequired disagrees with the referral that
 * caused it. Any of those is a money bug, so they are not separate steps.
 *
 * Two things are deliberately NOT in the transaction:
 *   - Notifications, which are best-effort and must not roll back a
 *     registration.
 *   - Duplicate detection as a *block*. A suspected duplicate is surfaced to
 *     the producer and to an admin for review rather than silently rejected,
 *     because a false positive would be indistinguishable from a real duplicate
 *     to the person filling in the form.
 */

export class DuplicateProducerError extends Error {
  constructor(public readonly duplicates: DuplicateResult) {
    super(
      "A Producer that looks like this one already exists. Contact Fortune Market Admin before continuing."
    );
    this.name = "DuplicateProducerError";
  }
}

export class SelfReferralError extends Error {
  constructor(public readonly reason: string) {
    super(reason);
    this.name = "SelfReferralError";
  }
}

export class SelfRegistrationError extends Error {
  constructor() {
    super(
      "You already have a Producer profile. A representative cannot register one of their own."
    );
    this.name = "SelfRegistrationError";
  }
}

export type FirstProductInput = {
  name: string;
  nameSi?: string;
  description?: string;
  descriptionSi?: string;
  price: number;
  unit?: string;
  unitSi?: string;
  stock?: number;
  images?: string;
  categoryId: string;
};

export type RegisterProducerInput = {
  userId: string;
  businessName: string;
  businessNameSi?: string;
  description?: string;
  descriptionSi?: string;
  location: string;
  district: string;
  phone: string;
  businessRegistrationNo?: string | null;
  email?: string | null;
  nic?: string | null;
  /** From the signed referral cookie. Ignored unless the rep is still active. */
  referral?: ResolvedReferral | null;
  firstProduct?: FirstProductInput | null;
};

export type FeeDecision = {
  required: boolean;
  basis: "REFERRAL" | "GATE_ENFORCED" | null;
  amount: number;
  settingsId: string;
};

export type RegisterProducerResult = {
  producer: { id: string; businessName: string; verificationStatus: string };
  payment: { id: string; amount: number; feeRequired: boolean; feeBasis: string | null };
  referral: {
    id: string;
    representativeId: string;
    representativeUserId: string;
    referralCode: string;
  } | null;
  fee: FeeDecision;
  duplicates: DuplicateResult;
};

/**
 * The producer filling in the form is a Producer too, so the same user can never
 * be the producer and the representative who referred them. Checked against the
 * real user, not a submitted identifier, so it cannot be bypassed by changing
 * the phone number in the form.
 */
async function assertNotTheRepresentative(
  tx: import("@prisma/client").Prisma.TransactionClient,
  input: RegisterProducerInput
): Promise<void> {
  const representative = await tx.representative.findUnique({
    where: { userId: input.userId },
    select: { id: true },
  });
  if (representative) {
    throw new SelfRegistrationError();
  }
}

/**
 * Registers a producer, freezing the fee decision at this moment.
 *
 * `now` is injectable so the fee gate can be tested at a date either side of
 * the closing date without touching the system clock.
 */
export async function registerProducer(
  input: RegisterProducerInput,
  now: Date = new Date()
): Promise<RegisterProducerResult> {
  // Read the settings and resolve the referral BEFORE opening the transaction
  // only for the network round trip it saves; both are re-read inside the
  // transaction, which is what the decision is actually based on.
  await getSettings();

  const result = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);

    // Re-read the representative inside the transaction. The cookie payload was
    // resolved earlier in the request, and an admin may have suspended the rep
    // since; attribution must reflect the state at commit, not at page load.
    let lockedReferral: {
      id: string;
      // Notifications are addressed to a User, so the rep's userId is carried
      // alongside the Representative id. Sending the Representative id would
      // create a notification row pointing at a non-existent user.
      userId: string;
      code: string;
      status: string;
      leadId: string | null;
      fullName: string;
      email: string;
      phone: string;
      whatsapp: string | null;
      nic: string | null;
    } | null = null;

    if (input.referral?.code) {
      const rep = await tx.representative.findUnique({
        where: { code: input.referral.code.toUpperCase() },
        select: {
          id: true,
          userId: true,
          code: true,
          status: true,
          fullName: true,
          email: true,
          phone: true,
          whatsapp: true,
          nic: true,
        },
      });
      // canConvertReferrals is applied to the freshly read status, so a
      // suspended rep's link still works as a visit but earns nothing.
      if (rep && canConvertReferrals(rep)) {
        lockedReferral = { ...rep, leadId: input.referral.leadId ?? null };
      }
    }

    if (lockedReferral) {
      const self = await checkSelfReferral({
        representative: {
          phone: lockedReferral.phone,
          whatsapp: lockedReferral.whatsapp,
          email: lockedReferral.email,
          nic: lockedReferral.nic,
        },
        producer: {
          userId: input.userId,
          phone: input.phone,
          email: input.email ?? null,
          businessRegistrationNo: input.businessRegistrationNo ?? null,
        },
      });
      if (self.isSelfReferral) {
        throw new SelfReferralError(self.reason ?? "Self-referral detected.");
      }
    }

    await assertNotTheRepresentative(tx, input);

    // Inside the transaction, so two producers cannot both pass a duplicate
    // check on the same phone number and then both be created.
    const duplicates = await checkProducerDuplicates(
      {
        phone: input.phone,
        email: input.email,
        businessName: input.businessName,
        // Advisory only: a Sinhala-name overlap is surfaced to the reviewing
        // admin, never treated as a duplicate. See findSinhalaNameMatches.
        businessNameSi: input.businessNameSi,
        nic: input.nic,
      },
      tx
    );
    if (duplicates.isDuplicate) {
      throw new DuplicateProducerError(duplicates);
    }

    // The single decision point. Frozen onto the payment row below and never
    // recomputed, so the producer keeps this price even if the gate moves
    // before an admin reviews them.
    const decision = isFeeRequired(
      { hasLockedReferral: lockedReferral !== null },
      settings,
      now
    );
    const amount = decision.required ? settings.producerAnnualRegistrationFee : 0;

    const producer = await tx.producer.create({
      data: {
        userId: input.userId,
        businessName: input.businessName,
        businessNameSi: input.businessNameSi || input.businessName,
        description: input.description ?? "",
        descriptionSi: input.descriptionSi || input.description || "",
        location: input.location,
        district: input.district,
        phone: input.phone,
        businessRegistrationNo: input.businessRegistrationNo ?? null,
        // Left at the PENDING default on purpose: no commission can be created
        // until an admin approves, which is enforced again in
        // evaluateCommissionEligibility.
      },
      select: { id: true, businessName: true, verificationStatus: true },
    });

    let referralRow: {
      id: string;
      representativeId: string;
      representativeUserId: string;
      referralCode: string;
    } | null = null;
    if (lockedReferral) {
      const created = await tx.producerReferral.create({
        data: {
          producerId: producer.id,
          representativeId: lockedReferral.id,
          leadId: lockedReferral.leadId,
          referralCode: lockedReferral.code,
          source: input.referral?.leadId ? "MANUAL" : "LINK",
          status: "ACTIVE",
          lockedAt: now,
        },
        select: { id: true, representativeId: true, referralCode: true },
      });
      referralRow = { ...created, representativeUserId: lockedReferral.userId };
    }

    const payment = await tx.producerRegistrationPayment.create({
      data: {
        producerId: producer.id,
        kind: "INITIAL",
        amount,
        currency: settings.currency,
        // A zero-amount row is created even when no fee is owed, rather than
        // creating no row. "No payment needed" and "we forgot to record the
        // decision" must not look the same in the admin queue.
        status: amount === 0 ? "WAIVED" : "PENDING",
        feeRequired: decision.required,
        feeBasis: decision.basis,
        ...(amount === 0
          ? {
              waivedAt: now,
              // System-generated, not an admin decision. waivedById stays null
              // so a rep can never be credited from a no-fee row; and
              // evaluateCommissionEligibility requires an admin on any WAIVED
              // row that does pay out.
              waiveReason:
                decision.basis === null
                  ? "Registration fee not applicable: producer registered before the fee gate closed."
                  : "Registration fee not applicable.",
            }
          : {}),
      },
      select: { id: true, amount: true, feeRequired: true, feeBasis: true },
    });

    if (input.firstProduct) {
      await tx.product.create({
        data: {
          producerId: producer.id,
          categoryId: input.firstProduct.categoryId,
          name: input.firstProduct.name,
          nameSi: input.firstProduct.nameSi || input.firstProduct.name,
          description: input.firstProduct.description ?? "",
          descriptionSi:
            input.firstProduct.descriptionSi || input.firstProduct.description || "",
          price: input.firstProduct.price,
          unit: input.firstProduct.unit || "piece",
          unitSi: input.firstProduct.unitSi || "කැබැල්ල",
          stock: input.firstProduct.stock ?? 0,
          images: input.firstProduct.images ?? "[]",
        },
      });
    }

    if (lockedReferral?.leadId) {
      // A lead may only be closed by the system once, and only by a
      // representative who owns it, so a crafted cookie cannot close somebody
      // else's lead.
      const lead = await tx.representativeLead.findFirst({
        where: { id: lockedReferral.leadId, representativeId: lockedReferral.id },
        select: { id: true, status: true },
      });
      if (lead) {
        await tx.representativeLead.update({
          where: { id: lead.id },
          data: {
            producerId: producer.id,
            status: "REGISTERED",
            convertedAt: now,
            // The status is now system-owned; a representative must not be able
            // to walk it back to INTERESTED after the money is involved.
            statusLocked: true,
          },
        });
      }
    }

    return {
      producer,
      payment,
      referral: referralRow,
      fee: {
        required: decision.required,
        basis: decision.basis,
        amount,
        settingsId: settings.id,
      },
      duplicates,
    };
  }, { timeout: 15000, maxWait: 8000 });

  // Post-commit, best-effort. A failed notification must not undo a
  // registration that has already been written.
  await Promise.allSettled([
    notifyRegistration(result),
    recordAudit({
      actor: { id: input.userId, role: "PRODUCER" },
      action: "PRODUCER_REGISTERED",
      entityType: "Producer",
      entityId: result.producer.id,
      representativeId: result.referral?.representativeId,
      newValue: {
        feeRequired: result.fee.required,
        feeBasis: result.fee.basis,
        amount: result.payment.amount,
        attributedTo: result.referral?.representativeId ?? null,
      },
    }),
  ]);

  return result;
}

async function notifyRegistration(result: RegisterProducerResult): Promise<void> {
  // Admin notification is created by the admin queue view rather than fanned out
  // to every admin here, to avoid a fan-out storm as reps are onboarded. The
  // representative is notified directly, because a converted referral is the
  // single most important event in their dashboard.
  if (!result.referral) return;

  // Addressed by the representative's User id, not the Representative id:
  // Notification.userId is a foreign key to User.
  await createNotification({
    userId: result.referral.representativeUserId,
    type: "PRODUCER_REGISTERED",
    subjectType: "Producer",
    subjectId: result.producer.id,
    title: "A producer you referred has registered",
    body: `Their registration is recorded and awaiting the Rs. ${result.payment.amount.toLocaleString("en-LK")} registration fee confirmation.`,
    link: `/representative/referrals/${result.producer.id}`,
  });
}
