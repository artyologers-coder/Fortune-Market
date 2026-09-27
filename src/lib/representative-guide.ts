import { prisma } from "@/lib/prisma";
import { recordAudit, type AuditActor } from "@/lib/audit";

/**
 * Editable guidance shown to prospective and active representatives.
 *
 * The content lives in the database rather than in the code because it changes
 * for commercial reasons — commission terms, payment timing — and those are not
 * changes that should need a deploy. Every write is audited with the previous
 * body, because "what did the representatives read at the time" is the whole
 * point of guidance that quotes figures.
 *
 * `visible` is separate from existence: hiding a section is a normal editorial
 * act, whereas deleting one loses the history. Hiding is what the public reads.
 */

export class GuideValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GuideValidationError";
  }
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_TITLE = 200;
const MAX_BODY = 20_000;

/** Slugs appear in URLs, so they are constrained to a safe, readable shape. */
export function assertValidSlug(slug: string): string {
  const trimmed = slug.trim().toLowerCase();
  if (!trimmed) throw new GuideValidationError("A guide section needs a slug.");
  if (trimmed.length > 80) throw new GuideValidationError("That slug is too long.");
  if (!SLUG_PATTERN.test(trimmed)) {
    throw new GuideValidationError(
      "A slug may only contain lowercase letters, numbers and single hyphens."
    );
  }
  return trimmed;
}

function assertText(value: string, label: string, max: number): string {
  const trimmed = value.trim();
  if (!trimmed) throw new GuideValidationError(`${label} cannot be empty.`);
  if (trimmed.length > max) {
    throw new GuideValidationError(`${label} cannot be longer than ${max} characters.`);
  }
  return trimmed;
}

function assertSortOrder(value: number): number {
  if (!Number.isInteger(value)) {
    throw new GuideValidationError("The sort order must be a whole number.");
  }
  // Bounded so a stray value cannot push a section permanently out of reach.
  if (value < 0 || value > 9999) {
    throw new GuideValidationError("The sort order must be between 0 and 9999.");
  }
  return value;
}

/** What the public reads: visible sections, in editorial order. */
export async function listVisibleGuide() {
  return prisma.representativeGuideSection.findMany({
    where: { visible: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: { slug: true, title: true, body: true, sortOrder: true, updatedAt: true },
  });
}

/** What an admin edits: everything, including hidden sections. */
export async function listAllGuide() {
  return prisma.representativeGuideSection.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });
}

export async function getGuideSection(id: string) {
  return prisma.representativeGuideSection.findUnique({ where: { id } });
}

export type CreateGuideInput = {
  slug: string;
  title: string;
  body: string;
  sortOrder: number;
  visible: boolean;
};

export async function createGuideSection(input: CreateGuideInput, actor: AuditActor | null) {
  const slug = assertValidSlug(input.slug);
  const title = assertText(input.title, "The title", MAX_TITLE);
  const body = assertText(input.body, "The body", MAX_BODY);
  const sortOrder = assertSortOrder(input.sortOrder);

  const clash = await prisma.representativeGuideSection.findUnique({ where: { slug } });
  if (clash) throw new GuideValidationError(`A section with the slug "${slug}" already exists.`);

  const created = await prisma.representativeGuideSection.create({
    data: { slug, title, body, sortOrder, visible: input.visible, updatedById: actor?.id ?? null },
  });

  await recordAudit({
    actor,
    action: "GUIDE_SECTION_CREATED",
    entityType: "RepresentativeGuideSection",
    entityId: created.id,
    newValue: { slug, title, sortOrder, visible: input.visible },
  });

  return created;
}

export type UpdateGuideInput = {
  slug?: string;
  title?: string;
  body?: string;
  sortOrder?: number;
  visible?: boolean;
};

export async function updateGuideSection(
  id: string,
  input: UpdateGuideInput,
  actor: AuditActor | null
) {
  const existing = await getGuideSection(id);
  if (!existing) throw new GuideValidationError("That guide section does not exist.");

  const data: Record<string, unknown> = {};
  if (input.slug !== undefined) {
    const slug = assertValidSlug(input.slug);
    const clash = await prisma.representativeGuideSection.findFirst({
      where: { slug, id: { not: id } },
      select: { id: true },
    });
    if (clash) throw new GuideValidationError(`A section with the slug "${slug}" already exists.`);
    data.slug = slug;
  }
  if (input.title !== undefined) data.title = assertText(input.title, "The title", MAX_TITLE);
  if (input.body !== undefined) data.body = assertText(input.body, "The body", MAX_BODY);
  if (input.sortOrder !== undefined) data.sortOrder = assertSortOrder(input.sortOrder);
  if (input.visible !== undefined) data.visible = input.visible;

  if (Object.keys(data).length === 0) {
    throw new GuideValidationError("There was nothing to change.");
  }
  if (actor?.id) data.updatedById = actor.id;

  const updated = await prisma.representativeGuideSection.update({ where: { id }, data });

  // The body is deliberately not in the audit payload: it is long, and the
  // point of the entry is which section changed and how, not a second copy of
  // prose that the section itself already holds.
  await recordAudit({
    actor,
    action: "GUIDE_SECTION_UPDATED",
    entityType: "RepresentativeGuideSection",
    entityId: id,
    previousValue: {
      slug: existing.slug,
      title: existing.title,
      sortOrder: existing.sortOrder,
      visible: existing.visible,
    },
    newValue: {
      slug: updated.slug,
      title: updated.title,
      sortOrder: updated.sortOrder,
      visible: updated.visible,
    },
  });

  return updated;
}

export async function deleteGuideSection(id: string, actor: AuditActor | null) {
  const existing = await getGuideSection(id);
  if (!existing) throw new GuideValidationError("That guide section does not exist.");

  // Refusing to delete the last visible section is deliberate: the guide is the
  // programme's explanation of itself, and an empty one is worse than a bad one.
  if (existing.visible) {
    const otherVisible = await prisma.representativeGuideSection.count({
      where: { visible: true, id: { not: id } },
    });
    if (otherVisible === 0) {
      throw new GuideValidationError(
        "This is the only visible section. Hide another one first, or add a replacement."
      );
    }
  }

  await prisma.representativeGuideSection.delete({ where: { id } });

  await recordAudit({
    actor,
    action: "GUIDE_SECTION_DELETED",
    entityType: "RepresentativeGuideSection",
    entityId: id,
    previousValue: { slug: existing.slug, title: existing.title, visible: existing.visible },
  });

  return existing;
}
