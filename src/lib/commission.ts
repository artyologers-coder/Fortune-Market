import type { Prisma } from "@prisma/client";
import type { Tx } from "@/lib/representative-code";
import { withCodeInTransaction } from "@/lib/representative-code";
import { getSettings } from "@/lib/representative-settings";
import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

/**
 * Representative commission engine.
 *
 * Three invariants this module exists to enforce:
 *
 *  1. A commission is only ever created for a LOCKED, still-ACTIVE referral.
 *     If the attribution is later reversed, the commission is reversed with
 *     it — never silently left behind.
 *  2. The amount is a SNAPSHOT taken from settings at the moment the
 *     commission is created. Changing the fee afterwards must not rewrite what
 *     someone already earned.
 *  3. Creation is idempotent. Approving a producer twice, or re-running a
 *     webhook, must not pay twice (enforced by a unique key on
 *     (producerId, kind)).
 */

/** Statuses that count as "money still owed to the representative". */
export const EARNING_STATUSES = [
  "PENDING",
  "ELIGIBLE",
  "APPROVED",
  "PAYABLE",
  "PAID",
] as const;

export const OPEN_COMMISSION_STATUSES = [
  "PENDING",
  "ELIGIBLE",
  "APPROVED",
  "PAYABLE",
] as const;

/**
 * Statuses that may actually be included in a payout.
 *
 * Narrower than OPEN_COMMISSION_STATUSES on purpose. PENDING means the producer
 * has not been approved yet and ELIGIBLE only means the rules were satisfied,
 * so neither is a decision that the money is owed. Paying on those would let a
 * commission be swept into a payout while the producer's approval was still
 * being contested. An admin must move the commission to APPROVED first.
 */
export const PAYABLE_COMMISSION_STATUSES = ["APPROVED", "PAYABLE"] as const;

/**
 * Payout statuses that still hold on to their commissions.
 *
 * PENDING and PAID reserve the money: it is spoken for, either awaiting transfer
 * or already transferred. CANCELLED and FAILED release it, which is the entire
 * reason CommissionPayoutItem is not unique on commissionId — otherwise a
 * cancelled payout would strand its representative's earnings forever.
 *
 * Every query that asks "is this commission already spoken for?" must use
 * commissionInActivePayout() / commissionFreeOfActivePayout() below. Reading
 * `payoutItems.length > 0` directly is the bug this indirection exists to
 * prevent.
 */
export const ACTIVE_PAYOUT_STATUSES = ["PENDING", "PAID"] as const;

/**
 * Payout statuses that block a representative from raising ANOTHER payout.
 *
 * Deliberately narrower than ACTIVE_PAYOUT_STATUSES. The two answer different
 * questions and conflating them strands a representative's earnings:
 *
 *   - ACTIVE_PAYOUT_STATUSES answers "is this commission's money spoken for?"
 *     A PAID payout keeps that link forever as history, so its commissions must
 *     stay excluded from every new payout. Correct as is.
 *   - OPEN_PAYOUT_STATUSES answers "is a transfer in flight right now?" Only a
 *     PENDING payout is. A PAID payout is finished: the money has gone, the
 *     representative is free to accrue more commissions and be paid again.
 *
 * Using ACTIVE_PAYOUT_STATUSES for the open check means that after a single
 * successful payout, findFirst returns that old PAID row forever and every
 * future payout is refused with "still open". Use this constant for any
 * "is one in progress?" question.
 */
export const OPEN_PAYOUT_STATUSES = ["PENDING"] as const;

export function commissionInActivePayout(): Prisma.RepresentativeCommissionWhereInput {
  return { payoutItems: { some: { payout: { status: { in: [...ACTIVE_PAYOUT_STATUSES] } } } } };
}

export function commissionFreeOfActivePayout(): Prisma.RepresentativeCommissionWhereInput {
  return { payoutItems: { none: { payout: { status: { in: [...ACTIVE_PAYOUT_STATUSES] } } } } };
}

export type IneligibilityCode =
  | "NO_REFERRAL"
  | "REFERRAL_NOT_LOCKED"
  | "REFERRAL_INACTIVE"
  | "PRODUCER_NOT_APPROVED"
  | "PAYMENT_NOT_SETTLED"
  | "REP_NOT_ACTIVE";

export type EligibilityDecision =
  | { eligible: true; amount: number; basis: "PAID" | "ADMIN_WAIVER" }
  | { eligible: false; code: IneligibilityCode; reason: string };

export type IneligibilityDecision = Extract<EligibilityDecision, { eligible: false }>;

type EvaluateInput = {
  referral: {
    status: string;
    lockedAt: Date | null;
    representative: { id: string; status: string };
  } | null;
  producer: { verificationStatus: string };
  payment: { status: string; waivedById: string | null } | null;
  settings: { representativeInitialCommission: number };
};

/**
 * Decides whether a producer acquisition earns a commission, and why.
 *
 * Returned as data rather than acted on directly so the admin UI can display
 * the same reasoning and so the decision can be unit tested without a
 * database.
 */
export function evaluateCommissionEligibility(
  input: EvaluateInput
): EligibilityDecision {
  if (!input.referral) {
    return {
      eligible: false,
      code: "NO_REFERRAL",
      reason: "This producer was not acquired through a representative, so no commission is due.",
    };
  }

  if (input.referral.status !== "ACTIVE" || input.referral.lockedAt === null) {
    return {
      eligible: false,
      code: "REFERRAL_NOT_LOCKED",
      reason: "The referral for this producer is not active and locked, so no commission is due.",
    };
  }

  if (input.referral.representative.status !== "ACTIVE") {
    return {
      eligible: false,
      code: "REP_NOT_ACTIVE",
      reason: "The representative's account is not active, so the commission cannot be credited.",
    };
  }

  if (input.producer.verificationStatus !== "APPROVED") {
    return {
      eligible: false,
      code: "PRODUCER_NOT_APPROVED",
      reason: "A commission is only created once the producer account is approved.",
    };
  }

  const payment = input.payment;
  if (!payment) {
    return {
      eligible: false,
      code: "PAYMENT_NOT_SETTLED",
      reason: "No registration payment record exists for this producer.",
    };
  }

  if (payment.status === "PAID") {
    return {
      eligible: true,
      amount: input.settings.representativeInitialCommission,
      basis: "PAID",
    };
  }

  if (payment.status === "WAIVED") {
    // An admin waiver is an explicit decision to let a producer through without
    // money. It is NOT a penalty to the representative, so their commission
    // stands. A producer who was never referred has no representative, so this
    // branch cannot hand anyone money that was never earned.
    //
    // `waivedById` is required. A WAIVED row with no admin recorded against it
    // is not an explicit admin decision — it is unverified bookkeeping, and
    // crediting a commission from it would let anyone who can write to the
    // payments table pay a representative out of thin air.
    if (!payment.waivedById) {
      return {
        eligible: false,
        code: "PAYMENT_NOT_SETTLED",
        reason:
          "This payment is marked waived but has no admin recorded against it, so the commission is not yet earned.",
      };
    }
    return {
      eligible: true,
      amount: input.settings.representativeInitialCommission,
      basis: "ADMIN_WAIVER",
    };
  }

  return {
    eligible: false,
    code: "PAYMENT_NOT_SETTLED",
    reason: `The registration payment is ${payment.status.toLowerCase()}, so the commission is not yet earned.`,
  };
}

export type CreateCommissionInput = {
  producerId: string;
  registrationPaymentId: string | null;
  kind?: "INITIAL" | "RENEWAL";
  flagged?: boolean;
  flagReason?: string | null;
};

/**
 * Creates the commission for an acquired producer, or returns null with the
 * reason it was not created.
 *
 * Call inside the transaction that approves the producer so the payment,
 * approval and commission cannot diverge.
 */
export async function createCommissionForProducer(
  tx: Tx,
  input: CreateCommissionInput
): Promise<
  | { id: string; commissionCode: string; amount: number }
  | { skipped: IneligibilityDecision }
> {
  const kind = input.kind ?? "INITIAL";

  const existing = await tx.representativeCommission.findUnique({
    where: { producerId_kind: { producerId: input.producerId, kind } },
    select: { id: true, commissionCode: true, amount: true },
  });
  if (existing) {
    return existing;
  }

  const [producer, payment, settings] = await Promise.all([
    tx.producer.findUnique({
      where: { id: input.producerId },
      select: { id: true, verificationStatus: true },
    }),
    input.registrationPaymentId
      ? tx.producerRegistrationPayment.findUnique({
          where: { id: input.registrationPaymentId },
          select: { id: true, status: true, waivedById: true },
        })
      : tx.producerRegistrationPayment.findFirst({
          where: { producerId: input.producerId, kind },
          orderBy: { createdAt: "asc" },
          select: { id: true, status: true, waivedById: true },
        }),
    getSettings(),
  ]);

  if (!producer) {
    return {
      skipped: {
        eligible: false,
        code: "NO_REFERRAL",
        reason: "Producer not found.",
      },
    };
  }

  const referral = await tx.producerReferral.findUnique({
    where: { producerId: input.producerId },
    select: {
      status: true,
      lockedAt: true,
      representative: { select: { id: true, status: true } },
    },
  });

  const decision = evaluateCommissionEligibility({
    referral,
    producer,
    payment: payment ? { status: payment.status, waivedById: payment.waivedById } : null,
    settings,
  });

  if (!decision.eligible) {
    return { skipped: decision };
  }

  return withCodeInTransaction(tx, "commission", async (innerTx, commissionCode) => {
    const created = await innerTx.representativeCommission.create({
      data: {
        commissionCode,
        representativeId: referral!.representative.id,
        producerId: input.producerId,
        registrationPaymentId: payment?.id ?? null,
        kind,
        // Snapshot, never re-read.
        amount: decision.amount,
        currency: settings.currency,
        status: "ELIGIBLE",
        eligibleAt: new Date(),
        flagged: input.flagged ?? false,
        flagReason: input.flagReason ?? null,
      },
      select: { id: true, commissionCode: true, amount: true },
    });
    return created;
  });
}

/**
 * Cancels or reverses a commission. Used when a referral is reassigned or
 * reversed by an admin, and when a payment is refunded.
 *
 * `CANCELLED` is for a commission that should never have been payable;
 * `REVERSED` is for one that was already recognised in a balance and must be
 * clawed back. Both keep the row — the ledger is history, not a mutable
 * current-state table.
 */
export async function reverseCommission(
  commissionId: string,
  reason: string,
  actor: { id: string; role: string },
  mode: "CANCEL" | "REVERSE" = "REVERSE"
): Promise<{ id: string; status: string }> {
  if (!reason || !reason.trim()) {
    throw new Error("A reason is required to cancel or reverse a commission.");
  }

  const commission = await prisma.representativeCommission.findUnique({
    where: { id: commissionId },
    select: {
      id: true,
      status: true,
      amount: true,
      representativeId: true,
      payoutItems: {
        where: { payout: { status: { in: [...ACTIVE_PAYOUT_STATUSES] } } },
        select: { payoutId: true },
        take: 1,
      },
    },
  });

  if (!commission) throw new Error("Commission not found.");
  if (commission.status === "REVERSED" || commission.status === "CANCELLED") {
    return { id: commission.id, status: commission.status };
  }
  if (commission.payoutItems.length > 0) {
    throw new Error(
      "This commission is already part of a payout. Reverse the payout instead of the individual commission."
    );
  }

  const status = mode === "CANCEL" ? "CANCELLED" : "REVERSED";

  const updated = await prisma.representativeCommission.update({
    where: { id: commissionId },
    data: {
      status,
      cancelledAt: mode === "CANCEL" ? new Date() : undefined,
      cancellationReason: mode === "CANCEL" ? reason.trim() : undefined,
      reversedAt: mode === "REVERSE" ? new Date() : undefined,
      reversalReason: mode === "REVERSE" ? reason.trim() : undefined,
    },
    select: { id: true, status: true },
  });

  await recordAudit({
    actor,
    action: `COMMISSION_${status}`,
    entityType: "RepresentativeCommission",
    entityId: commissionId,
    representativeId: commission.representativeId,
    previousValue: { status: commission.status, amount: commission.amount },
    newValue: { status, reason: reason.trim() },
  });

  return updated;
}

export type EarningSummary = {
  counts: Record<string, number>;
  totals: Record<string, number>;
  currency: string;
  /**
   * Commission an admin has actually approved for payment and that is not yet
   * in a payout. Excludes PENDING/ELIGIBLE, which are still under review.
   */
  payableBalance: number;
};

/**
 * Aggregates a representative's earnings for the dashboard and admin views.
 * Grouped in SQL so a representative with thousands of commissions does not
 * pull every row into the app process.
 */
export async function getEarningSummary(
  representativeId: string
): Promise<EarningSummary> {
  const grouped = await prisma.representativeCommission.groupBy({
    by: ["status"],
    where: { representativeId },
    _count: { _all: true },
    _sum: { amount: true },
  });

  const counts: Record<string, number> = {};
  const totals: Record<string, number> = {};
  for (const row of grouped) {
    counts[row.status] = row._count._all;
    totals[row.status] = row._sum.amount ?? 0;
  }

  const settings = await getSettings();

  // Deliberately not a sum over PAYABLE_COMMISSION_STATUSES. Since payouts
  // exist, PAYABLE means "reserved by a payout", so summing the statuses would
  // keep showing money as payable after it had already been sent to the bank.
  // The balance is what is approved and still unreserved.
  const unreserved = await prisma.representativeCommission.aggregate({
    where: {
      representativeId,
      status: { in: [...PAYABLE_COMMISSION_STATUSES] },
      ...commissionFreeOfActivePayout(),
    },
    _sum: { amount: true },
  });
  const payableBalance = unreserved._sum.amount ?? 0;

  return {
    counts,
    totals,
    currency: settings.currency,
    payableBalance,
  };
}

/**
 * Commissions an admin has approved for payment and that are not yet in a
 * payout. Excludes PENDING and ELIGIBLE — see PAYABLE_COMMISSION_STATUSES.
 */
export async function listPayableCommissions(
  representativeId: string
): Promise<{ id: string; amount: number }[]> {
  const rows = await prisma.representativeCommission.findMany({
    where: {
      representativeId,
      status: { in: [...PAYABLE_COMMISSION_STATUSES] },
      ...commissionFreeOfActivePayout(),
      flagged: false,
    },
    select: { id: true, amount: true },
    orderBy: { eligibleAt: "asc" },
  });
  return rows;
}
