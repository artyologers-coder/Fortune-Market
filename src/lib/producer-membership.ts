import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { Tx } from "@/lib/representative-code";

export const MEMBERSHIP_DAYS = 365;

/**
 * Distinct from every key in representative-code.ts's LOCK_KEYS, because
 * membership ids are a different sequence and must not queue behind a code
 * allocation (or vice versa).
 */
const MEMBERSHIP_LOCK_KEY = 8_100_006;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export function membershipExpiryDate(activationDate: Date): Date {
  const epoch = new Date("2027-01-01T00:00:00.000Z");
  const base =
    activationDate.getTime() > epoch.getTime() ? activationDate : epoch;
  return new Date(base.getTime() + MEMBERSHIP_DAYS * MS_PER_DAY);
}

export async function generateMembershipId(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `FM-${year}-`;
  const count = await prisma.producer.count({
    where: { membershipId: { startsWith: prefix } },
  });
  return `${prefix}${String(count + 1).padStart(4, "0")}`;
}

export async function activateMembership(producerId: string) {
  const producer = await prisma.producer.findUnique({ where: { id: producerId } });
  if (!producer) return null;

  const now = new Date();
  const membershipId = producer.membershipId ?? (await generateMembershipId());

  return prisma.producer.update({
    where: { id: producerId },
    data: {
      membershipId,
      membershipActivatedAt: producer.membershipActivatedAt ?? now,
      membershipExpiresAt: membershipExpiryDate(now),
    },
  });
}

export async function renewMembership(producerId: string) {
  const producer = await prisma.producer.findUnique({ where: { id: producerId } });
  if (!producer) return null;

  const now = new Date();
  const current = producer.membershipExpiresAt ?? new Date("2027-01-01T00:00:00.000Z");
  const base = current.getTime() > now.getTime() ? current : now;
  const membershipId = producer.membershipId ?? (await generateMembershipId());

  return prisma.producer.update({
    where: { id: producerId },
    data: {
      membershipId,
      membershipActivatedAt: producer.membershipActivatedAt ?? now,
      membershipExpiresAt: new Date(base.getTime() + MEMBERSHIP_DAYS * MS_PER_DAY),
    },
  });
}

export type MembershipStatus = "ACTIVE" | "EXPIRED" | "NONE";

export function membershipStatus(
  producer?: { membershipExpiresAt?: Date | null } | null
): MembershipStatus {
  if (!producer?.membershipExpiresAt) return "NONE";
  return producer.membershipExpiresAt.getTime() > Date.now()
    ? "ACTIVE"
    : "EXPIRED";
}

export function membershipIsActive(
  producer?: { membershipExpiresAt?: Date | null } | null
): boolean {
  return membershipStatus(producer) === "ACTIVE";
}

export function activeMembershipWhere(
  now = new Date()
): Prisma.ProducerWhereInput {
  return {
    OR: [
      { membershipExpiresAt: null },
      { membershipExpiresAt: { gt: now } },
    ],
  };
}

export function visibleProducerProductWhere(
  now = new Date()
): Prisma.ProductWhereInput {
  return {
    producer: activeMembershipWhere(now),
  };
}

/**
 * Allocates a membership id inside a transaction the caller already owns.
 *
 * The same MATERIALIZED-CTE wrapper as representative-code.ts is required:
 * pg_advisory_xact_lock returns void, which Prisma cannot deserialize, and a
 * bare SELECT through $executeRaw silently no-ops instead of blocking. Two
 * admins approving two different producers at the same moment would otherwise
 * both count N producers and mint the same FM-2026-000N id.
 */
export async function withMembershipIdInTransaction<T>(
  tx: Tx,
  create: (tx: Tx, membershipId: string) => Promise<T>
): Promise<T> {
  await tx.$queryRaw`WITH membership_lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(${MEMBERSHIP_LOCK_KEY}::bigint)
  ) SELECT 1 AS acquired FROM membership_lock`;

  const year = new Date().getFullYear();
  const prefix = `FM-${year}-`;
  const count = await tx.producer.count({
    where: { membershipId: { startsWith: prefix } },
  });
  return create(tx, `${prefix}${String(count + 1).padStart(4, "0")}`);
}

/**
 * Transaction-local twin of activateMembership(). Use this inside an approval
 * transaction: the membership must be granted in the same commit as the
 * producer approval, or a crash could leave an approved producer with no
 * membership (or a membership for a producer who was never approved).
 *
 * Never shortens an existing membership: re-approving must not hand a producer
 * a free extension.
 */
export async function activateMembershipInTransaction(
  tx: Tx,
  producerId: string
) {
  const producer = await tx.producer.findUnique({
    where: { id: producerId },
    select: {
      id: true,
      membershipId: true,
      membershipActivatedAt: true,
      membershipExpiresAt: true,
    },
  });
  if (!producer) return null;

  const now = new Date();

  // Already active and not near expiry: leave the dates exactly as they are.
  if (
    producer.membershipId &&
    producer.membershipExpiresAt &&
    producer.membershipExpiresAt.getTime() > now.getTime()
  ) {
    return producer;
  }

  if (producer.membershipId) {
    return tx.producer.update({
      where: { id: producerId },
      data: { membershipExpiresAt: membershipExpiryDate(now) },
      select: { id: true, membershipId: true, membershipExpiresAt: true },
    });
  }

  return withMembershipIdInTransaction(tx, (innerTx, membershipId) =>
    innerTx.producer.update({
      where: { id: producerId },
      data: {
        membershipId,
        membershipActivatedAt: producer.membershipActivatedAt ?? now,
        membershipExpiresAt: membershipExpiryDate(now),
      },
      select: { id: true, membershipId: true, membershipExpiresAt: true },
    })
  );
}