import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Public identifier generation.
 *
 * Representative IDs are permanent and externally published (they appear in
 * referral links and on commission paperwork), so they must never collide or
 * be reused. A naive `count() + 1` is not safe under concurrency — two
 * concurrent approvals can read the same count and race to insert. This
 * module serialises generation with a Postgres transaction-scoped advisory
 * lock and performs the count and the insert inside the SAME transaction, so
 * a second caller blocks until the first has committed.
 *
 * (The pre-existing `generateMembershipId` in lib/producer-membership.ts uses
 * the racy count+1 pattern. This module is the safe equivalent.)
 */

export type CodeEntity =
  | "representative"
  | "application"
  | "lead"
  | "commission"
  | "payout";

export const CODE_PREFIXES: Record<CodeEntity, string> = {
  representative: "FM-REP-",
  application: "FM-APP-",
  lead: "FM-LEAD-",
  commission: "FM-COMM-",
  payout: "FM-PAY-",
};

export const CODE_REFERENCE: Record<CodeEntity, string> = {
  representative: "representative_code",
  application: "representative_applications",
  lead: "representative_leads",
  commission: "representative_commissions",
  payout: "commission_payouts",
};

/** Arbitrary but stable, distinct bigint keys — one per entity. */
const LOCK_KEYS: Record<CodeEntity, number> = {
  representative: 8_100_001,
  application: 8_100_002,
  lead: 8_100_003,
  commission: 8_100_004,
  payout: 8_100_005,
};

const CODE_WIDTH = 5;

export function formatCode(entity: CodeEntity, sequence: number): string {
  return `${CODE_PREFIXES[entity]}${String(sequence).padStart(CODE_WIDTH, "0")}`;
}

type Tx = Prisma.TransactionClient;

export type { Tx };

/**
 * Takes this entity's transaction-scoped advisory lock.
 *
 * The MATERIALIZED CTE wrapper is required, not stylistic. Two traps here:
 *
 *  - `pg_advisory_xact_lock` returns `void`, which Prisma cannot deserialize,
 *    so a plain `$queryRaw` on it throws.
 *  - A bare `SELECT pg_advisory_xact_lock(...)` sent through `$executeRaw` does
 *    NOT throw and does NOT block — it silently no-ops. That was verified
 *    against Postgres 18: five "serialized" allocations all produced the same
 *    code. The CTE forces evaluation and projects an `int` column instead.
 *
 * Locking is per-database, so the key is a fixed constant per entity.
 */
async function acquireLock(tx: Tx, entity: CodeEntity): Promise<void> {
  await tx.$queryRaw`WITH rep_lock AS MATERIALIZED (
    SELECT pg_advisory_xact_lock(${LOCK_KEYS[entity]}::bigint)
  ) SELECT 1 AS acquired FROM rep_lock`;
}

async function countWithPrefix(tx: Tx, entity: CodeEntity, prefix: string): Promise<number> {
  switch (entity) {
    case "representative":
      return tx.representative.count({ where: { code: { startsWith: prefix } } });
    case "application":
      return tx.representativeApplication.count({ where: { applicationCode: { startsWith: prefix } } });
    case "lead":
      return tx.representativeLead.count({ where: { leadCode: { startsWith: prefix } } });
    case "commission":
      return tx.representativeCommission.count({ where: { commissionCode: { startsWith: prefix } } });
    case "payout":
      return tx.commissionPayout.count({ where: { payoutCode: { startsWith: prefix } } });
  }
}

/**
 * Allocates a code inside a transaction the caller already owns. Use this when
 * the record must be created in the same transaction as other work (e.g.
 * approving a producer and recording the commission together), and keep the
 * advisory lock held for the rest of that transaction by not committing early.
 */
export async function withCodeInTransaction<T>(
  tx: Tx,
  entity: CodeEntity,
  create: (tx: Tx, code: string) => Promise<T>
): Promise<T> {
  await acquireLock(tx, entity);
  const prefix = CODE_PREFIXES[entity];
  const used = await countWithPrefix(tx, entity, prefix);
  return create(tx, formatCode(entity, used + 1));
}

/**
 * Runs `create` inside a transaction that holds this entity's advisory lock,
 * passing it the next unused code. The count and the insert share the
 * transaction, so the code cannot be handed out twice.
 */
export async function createWithGeneratedCode<T>(
  entity: CodeEntity,
  create: (tx: Tx, code: string) => Promise<T>
): Promise<T> {
  // The explicit timeouts across this system exist because the database is a
  // pooled, serverless Postgres: a cold connection can burn several seconds
  // before the first statement runs, and Prisma's 5s default would then abort a
  // commit that was about to succeed.
  return prisma.$transaction((tx) => withCodeInTransaction(tx, entity, create), {
    timeout: 15000,
    maxWait: 8000,
  });
}

/**
 * Convenience wrapper for entities that need a code but no other work in the
 * same transaction (e.g. leads, which are created standalone).
 */
export async function generateCodeFor(entity: CodeEntity): Promise<string> {
  return createWithGeneratedCode(entity, async (_tx, code) => code);
}
