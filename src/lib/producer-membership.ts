import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const MEMBERSHIP_DAYS = 365;

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