import { prisma } from "@/lib/prisma";
import type { Tx } from "@/lib/representative-code";
import { withCodeInTransaction } from "@/lib/representative-code";
import {
  PAYABLE_COMMISSION_STATUSES,
  OPEN_PAYOUT_STATUSES,
  commissionFreeOfActivePayout,
  getEarningSummary,
} from "@/lib/commission";
import { recordAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

/**
 * Commission payout execution.
 *
 * The lifecycle a commission walks, and who may move it:
 *
 *   ELIGIBLE  set automatically when a referred producer is approved
 *     -> APPROVED  an admin signs off (a flagged commission is never approvable)
 *       -> PAYABLE  reserved by a payout, money is spoken for
 *         -> PAID   the transfer went out
 *
 * Anything that has not reached APPROVED is invisible to the payout pool, which
 * is the point: a representative cannot be paid for a commission an admin has
 * not yet looked at.
 *
 * No step is a delete. A cancelled or failed payout keeps its rows and releases
 * its commissions back to the pool, so the history of what was attempted always
 * survives.
 */
export class PayoutStateError extends Error {}

export type PayoutActor = { id: string; role: string };

function requireReason(reason: string, minLength = 10): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < minLength) {
    throw new PayoutStateError(`A reason of at least ${minLength} characters is required.`);
  }
  return trimmed;
}

async function lockRepresentative(tx: Tx, representativeId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Representative" WHERE id = ${representativeId} FOR UPDATE`;
}

async function lockPayout(tx: Tx, payoutId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "CommissionPayout" WHERE id = ${payoutId} FOR UPDATE`;
}

/**
 * Moves one commission from ELIGIBLE to APPROVED.
 *
 * Refuses a flagged commission: flagging exists to pull something in front of a
 * human, and approving it by accident would defeat that.
 */
export async function approveCommission(
  commissionId: string,
  admin: PayoutActor
): Promise<{ id: string; status: string; amount: number }> {
  const commission = await prisma.representativeCommission.findUnique({
    where: { id: commissionId },
    select: { id: true, status: true, amount: true, flagged: true, flagReason: true, representativeId: true },
  });
  if (!commission) throw new PayoutStateError("Commission not found.");

  if (commission.status === "APPROVED" || commission.status === "PAYABLE") {
    return { id: commission.id, status: commission.status, amount: commission.amount };
  }
  if (commission.status !== "ELIGIBLE") {
    throw new PayoutStateError(
      `Only an eligible commission can be approved (this one is ${commission.status}).`
    );
  }
  if (commission.flagged) {
    throw new PayoutStateError(
      `This commission is flagged and cannot be approved until it is cleared: ${commission.flagReason ?? "no reason recorded"}`
    );
  }

  const updated = await prisma.representativeCommission.update({
    where: { id: commissionId },
    data: { status: "APPROVED", approvedAt: new Date(), approvedById: admin.id },
    select: { id: true, status: true, amount: true },
  });

  await recordAudit({
    actor: admin,
    action: "COMMISSION_APPROVED",
    entityType: "RepresentativeCommission",
    entityId: commissionId,
    representativeId: commission.representativeId,
    newValue: { status: "APPROVED", amount: commission.amount },
  });

  return updated;
}

/** Approves every unflagged eligible commission for a representative. */
export async function approveEligibleCommissions(
  representativeId: string,
  admin: PayoutActor
): Promise<{ approved: number; totalAmount: number }> {
  const rows = await prisma.representativeCommission.findMany({
    where: {
      representativeId,
      status: "ELIGIBLE",
      flagged: false,
      ...commissionFreeOfActivePayout(),
    },
    select: { id: true, amount: true },
  });

  let totalAmount = 0;
  for (const row of rows) {
    const done = await approveCommission(row.id, admin);
    totalAmount += done.amount;
  }
  return { approved: rows.length, totalAmount };
}

export type PayoutSummary = {
  id: string;
  payoutCode: string;
  amount: number;
  currency: string;
  status: string;
  itemCount: number;
  createdAt: Date;
};

/**
 * Reserves everything currently payable to a representative and raises a payout
 * for it.
 *
 * Refuses outright rather than quietly paying a partial amount when the
 * representative has no money waiting, so an admin who clicks twice sees a
 * clear reason instead of an empty payout.
 */
export async function createPayoutForRepresentative(
  representativeId: string,
  admin: PayoutActor,
  options: { method?: string; note?: string } = {}
): Promise<PayoutSummary & { items: { id: string; amount: number }[] }> {
  const rep = await prisma.representative.findUnique({
    where: { id: representativeId },
    select: { id: true, code: true, status: true, userId: true, fullName: true },
  });
  if (!rep) throw new PayoutStateError("Representative not found.");

  // A suspended account is read-only for the representative, but it must not be
  // silently drained either. Reinstate first so the payment has an owner.
  if (rep.status !== "ACTIVE") {
    throw new PayoutStateError(
      `This representative is ${rep.status.toLowerCase()} and cannot be paid. Reinstate the account first.`
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      await lockRepresentative(tx, representativeId);

      // One live payout per representative at a time: two open transfers to the
      // same person is exactly the double-payment this is guarding against.
      // Only PENDING counts as in flight — a PAID payout is settled history and
      // must not block the representative's next payment.
      const openPayout = await tx.commissionPayout.findFirst({
        where: { representativeId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
        select: { id: true, payoutCode: true },
      });
      if (openPayout) {
        throw new PayoutStateError(
          `Payout ${openPayout.payoutCode} is still open. Pay or cancel it before raising another.`
        );
      }

      const commissions = await tx.representativeCommission.findMany({
        where: {
          representativeId,
          status: { in: [...PAYABLE_COMMISSION_STATUSES] },
          ...commissionFreeOfActivePayout(),
          flagged: false,
        },
        select: { id: true, amount: true, eligibleAt: true },
        orderBy: { eligibleAt: "asc" },
      });

      if (commissions.length === 0) {
        throw new PayoutStateError(
          "There is nothing payable to this representative yet. Commissions must be approved before they can be paid."
        );
      }

      // Snapshot the sum from the rows read above, inside the same lock. Never
      // re-read the commission table to total a payout: between the read and the
      // write a reversal could land and the total would no longer match the items.
      const amount = commissions.reduce((sum, c) => sum + c.amount, 0);

      return withCodeInTransaction(tx, "payout", async (innerTx, payoutCode) => {
        const payout = await innerTx.commissionPayout.create({
          data: {
            payoutCode,
            representativeId,
            amount,
            status: "PENDING",
            method: options.method ?? "BANK_TRANSFER",
            note: options.note?.trim() || null,
            processedById: admin.id,
          },
          select: { id: true, payoutCode: true, amount: true, currency: true, status: true, createdAt: true },
        });

        await innerTx.commissionPayoutItem.createMany({
          data: commissions.map((c) => ({
            payoutId: payout.id,
            commissionId: c.id,
            amount: c.amount,
          })),
        });

        // Reserved, not yet transferred.
        await innerTx.representativeCommission.updateMany({
          where: { id: { in: commissions.map((c) => c.id) } },
          data: { status: "PAYABLE" },
        });

        return {
          ...payout,
          itemCount: commissions.length,
          items: commissions.map((c) => ({ id: c.id, amount: c.amount })),
        };
      });
    },
    { timeout: 15000, maxWait: 8000 }
  );

  await Promise.allSettled([
    recordAudit({
      actor: admin,
      action: "PAYOUT_CREATED",
      entityType: "CommissionPayout",
      entityId: result.id,
      representativeId,
      newValue: {
        payoutCode: result.payoutCode,
        amount: result.amount,
        itemCount: result.items.length,
        method: options.method ?? "BANK_TRANSFER",
      },
    }),
    createNotification({
      userId: rep.userId,
      type: "COMMISSION_APPROVED",
      subjectType: "CommissionPayout",
      subjectId: result.id,
      title: "Your payout is being processed",
      body: `Rs. ${result.amount.toLocaleString("en-LK")} covering ${result.items.length} commission${
        result.items.length === 1 ? "" : "s"
      } is on its way.`,
      link: "/representative/earnings",
    }),
  ]);

  return result;
}

/**
 * Marks the transfer as sent. This is the only irreversible step in the whole
 * earnings flow, so it requires a reference and refuses anything already paid.
 */
export async function markPayoutPaid(
  payoutId: string,
  admin: PayoutActor,
  options: { reference: string; method?: string } = { reference: "" }
): Promise<PayoutSummary> {
  const reference = (options.reference ?? "").trim();
  if (reference.length < 4) {
    throw new PayoutStateError(
      "A transfer reference of at least 4 characters is required, so this payment can be traced."
    );
  }

  const result = await prisma.$transaction(
    async (tx) => {
      await lockPayout(tx, payoutId);

      const payout = await tx.commissionPayout.findUniqueOrThrow({
        where: { id: payoutId },
        select: {
          id: true,
          payoutCode: true,
          status: true,
          amount: true,
          currency: true,
          createdAt: true,
          representativeId: true,
          method: true,
          items: { select: { id: true, commissionId: true, amount: true } },
        },
      });

      if (payout.status === "PAID") {
        return { ...payout, itemCount: payout.items.length, method: options.method ?? payout.method };
      }
      if (payout.status !== "PENDING") {
        throw new PayoutStateError(
          `Only a pending payout can be paid (this one is ${payout.status}).`
        );
      }
      if (payout.items.length === 0) {
        throw new PayoutStateError("This payout has no items and cannot be paid.");
      }

      // The items' total must still equal the header. A mismatch means something
      // moved underneath us and paying it would send the wrong amount.
      const itemTotal = payout.items.reduce((sum, i) => sum + i.amount, 0);
      if (itemTotal !== payout.amount) {
        throw new PayoutStateError(
          `This payout's items total Rs. ${itemTotal.toLocaleString(
            "en-LK"
          )} but its header says Rs. ${payout.amount.toLocaleString("en-LK")}. Do not pay it; investigate first.`
        );
      }

      const now = new Date();
      const method = options.method ?? payout.method;

      await tx.commissionPayout.update({
        where: { id: payoutId },
        data: { status: "PAID", paidAt: now, reference, processedById: admin.id, method },
        select: { id: true, payoutCode: true, amount: true, currency: true, status: true, createdAt: true },
      });

      await tx.representativeCommission.updateMany({
        where: { id: { in: payout.items.map((i) => i.commissionId) } },
        data: {
          status: "PAID",
          paidAt: now,
          paymentReference: reference,
          paymentMethod: method,
          paidById: admin.id,
        },
      });

      return {
        id: payout.id,
        payoutCode: payout.payoutCode,
        amount: payout.amount,
        currency: payout.currency,
        status: "PAID",
        itemCount: payout.items.length,
        createdAt: payout.createdAt,
        method,
        representativeId: payout.representativeId,
      };
    },
    { timeout: 15000, maxWait: 8000 }
  );

  await Promise.allSettled([
    recordAudit({
      actor: admin,
      action: "PAYOUT_PAID",
      entityType: "CommissionPayout",
      entityId: result.id,
      representativeId: result.representativeId,
      newValue: { payoutCode: result.payoutCode, amount: result.amount, reference, method: result.method },
    }),
    (async () => {
      const rep = await prisma.representative.findUniqueOrThrow({
        where: { id: result.representativeId },
        select: { userId: true },
      });
      await createNotification({
        userId: rep.userId,
        type: "COMMISSION_PAID",
        subjectType: "CommissionPayout",
        subjectId: result.id,
        title: "Your payout has been sent",
        body: `Rs. ${result.amount.toLocaleString("en-LK")} was transferred. Reference ${reference}.`,
        link: "/representative/earnings",
      });
    })(),
  ]);

  return result;
}

/**
 * The shared, single-transaction ending for a payout that is not going out.
 *
 * A cancellation and a failed transfer are the same event with different words:
 * the money did not leave, so the commissions must go back to APPROVED and the
 * row must be kept as history. They differ only in the terminal status, the
 * audit action, and what the representative is told.
 *
 * Doing this in ONE transaction under the payout lock is the point. The previous
 * markPayoutFailed read the status unlocked, called cancelPayout (its own
 * transaction), then issued a third unguarded write to flip CANCELLED to
 * FAILED. A crash between those left a payout stuck in CANCELLED that could
 * never be marked failed, and the audit trail recorded PAYOUT_CANCELLED for
 * transfers that had actually bounced — indistinguishable from a deliberate
 * cancellation in the one log a regulator would read.
 */
async function finalizePayout(
  payoutId: string,
  admin: PayoutActor,
  target: "CANCELLED" | "FAILED",
  reason: string
): Promise<PayoutSummary & { releasedCommissions: number; alreadyFinal: boolean; representativeId: string }> {
  const why = requireReason(reason);

  const result = await prisma.$transaction(
    async (tx) => {
      await lockPayout(tx, payoutId);

      const payout = await tx.commissionPayout.findUniqueOrThrow({
        where: { id: payoutId },
        select: {
          id: true,
          payoutCode: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          representativeId: true,
          items: { select: { id: true, commissionId: true } },
        },
      });

      // Idempotent on the same ending, so a double click or a retried request
      // is harmless rather than an error the admin has to interpret.
      if (payout.status === target) {
        return {
          id: payout.id,
          payoutCode: payout.payoutCode,
          amount: payout.amount,
          currency: payout.currency,
          status: payout.status,
          itemCount: payout.items.length,
          createdAt: payout.createdAt,
          representativeId: payout.representativeId,
          releasedCommissions: 0,
          alreadyFinal: true,
        };
      }

      if (payout.status === "PAID") {
        throw new PayoutStateError(
          "This payout has already been paid and cannot be changed. Record a corrective payout instead."
        );
      }

      if (payout.status !== "PENDING") {
        throw new PayoutStateError(
          `Only a pending payout can be ${target === "CANCELLED" ? "cancelled" : "failed"} (this one is ${payout.status}).`
        );
      }

      await tx.commissionPayout.update({
        where: { id: payoutId },
        data: { status: target, note: why },
        select: { id: true },
      });

      // Back to APPROVED, not ELIGIBLE: the money was already admin-approved to
      // be paid, and the transfer not going out is not a reason to make an admin
      // approve it a second time. Items are kept as the record of what was
      // attempted.
      let released = 0;
      if (payout.items.length > 0) {
        await tx.representativeCommission.updateMany({
          where: { id: { in: payout.items.map((i) => i.commissionId) }, status: "PAYABLE" },
          data: { status: "APPROVED" },
        });
        released = payout.items.length;
      }

      return {
        id: payout.id,
        payoutCode: payout.payoutCode,
        amount: payout.amount,
        currency: payout.currency,
        status: target,
        itemCount: payout.items.length,
        createdAt: payout.createdAt,
        representativeId: payout.representativeId,
        releasedCommissions: released,
        alreadyFinal: false,
      };
    },
    { timeout: 15000, maxWait: 8000 }
  );

  // Post-commit and best-effort: a failed notification must not undo a state
  // change that is already durably written.
  const { representativeId, alreadyFinal, ...summary } = result;
  if (!alreadyFinal) {
    const isFailure = target === "FAILED";
    await Promise.allSettled([
      recordAudit({
        actor: admin,
        action: isFailure ? "PAYOUT_FAILED" : "PAYOUT_CANCELLED",
        entityType: "CommissionPayout",
        entityId: summary.id,
        representativeId,
        newValue: { payoutCode: summary.payoutCode, reason: why, released: summary.releasedCommissions },
      }),
      (async () => {
        const rep = await prisma.representative.findUniqueOrThrow({
          where: { id: representativeId },
          select: { userId: true },
        });
        await createNotification({
          userId: rep.userId,
          type: "COMMISSION_APPROVED",
          subjectType: "CommissionPayout",
          subjectId: result.id,
          title: isFailure ? "Your payout could not be sent" : "Your payout was cancelled",
          body: isFailure
            ? `The transfer of ${summary.payoutCode} did not go through. Your Rs. ${summary.amount.toLocaleString(
                "en-LK"
              )} is back in your payable balance.`
            : `Payout ${summary.payoutCode} was cancelled and your Rs. ${summary.amount.toLocaleString(
                "en-LK"
              )} is back in your payable balance.`,
          link: "/representative/earnings",
        });
      })(),
    ]);
  }

  return { ...summary, alreadyFinal, representativeId };
}

/**
 * Abandons a payout and puts its commissions back in the pool.
 *
 * The payout row and its items are kept — this is a status change, never a
 * delete — so the record of a transfer that was attempted and abandoned stays
 * visible to both the admin and the representative.
 */
export async function cancelPayout(
  payoutId: string,
  admin: PayoutActor,
  reason: string
): Promise<PayoutSummary & { releasedCommissions: number; alreadyCancelled: boolean }> {
  const { alreadyFinal, ...summary } = await finalizePayout(payoutId, admin, "CANCELLED", reason);
  return { ...summary, alreadyCancelled: alreadyFinal };
}

/**
 * A failed transfer behaves exactly like a cancellation: the money comes back.
 *
 * Same transaction, same lock, same release — but the payout is written FAILED
 * and audited as PAYOUT_FAILED, so a bounced bank transfer is never recorded as
 * a deliberate cancellation.
 */
export async function markPayoutFailed(
  payoutId: string,
  admin: PayoutActor,
  reason: string
): Promise<PayoutSummary & { releasedCommissions: number; alreadyFailed: boolean }> {
  const { alreadyFinal, ...summary } = await finalizePayout(payoutId, admin, "FAILED", reason);
  return { ...summary, alreadyFailed: alreadyFinal };
}

export async function listPayoutsForRepresentative(representativeId: string) {
  return prisma.commissionPayout.findMany({
    where: { representativeId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      payoutCode: true,
      amount: true,
      currency: true,
      status: true,
      method: true,
      reference: true,
      note: true,
      paidAt: true,
      createdAt: true,
      items: { select: { id: true, amount: true, commissionId: true } },
    },
  });
}

export async function listAllPayouts(status?: string) {
  return prisma.commissionPayout.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      payoutCode: true,
      amount: true,
      currency: true,
      status: true,
      method: true,
      reference: true,
      note: true,
      paidAt: true,
      createdAt: true,
      representative: {
        select: { id: true, code: true, fullName: true, status: true, bankAccountName: true },
      },
      items: { select: { id: true, amount: true } },
    },
  });
}

/** Everything an admin needs on the payout screen for one representative. */
export async function getPayoutReadiness(representativeId: string) {
  const rep = await prisma.representative.findUnique({
    where: { id: representativeId },
    select: {
      id: true,
      code: true,
      fullName: true,
      status: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankBranch: true,
    },
  });
  if (!rep) throw new PayoutStateError("Representative not found.");

  const [summary, eligible, flagged, approved, openPayout, recent] = await Promise.all([
    getEarningSummary(representativeId),
    prisma.representativeCommission.count({
      where: { representativeId, status: "ELIGIBLE", flagged: false, ...commissionFreeOfActivePayout() },
    }),
    prisma.representativeCommission.findMany({
      where: { representativeId, status: "ELIGIBLE", flagged: true, ...commissionFreeOfActivePayout() },
      select: { id: true, amount: true, flagReason: true },
    }),
    prisma.representativeCommission.aggregate({
      where: { representativeId, status: { in: [...PAYABLE_COMMISSION_STATUSES] }, ...commissionFreeOfActivePayout() },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.commissionPayout.findFirst({
      where: { representativeId, status: { in: [...OPEN_PAYOUT_STATUSES] } },
      select: { id: true, payoutCode: true, amount: true, status: true },
    }),
    listPayoutsForRepresentative(representativeId).then((rows) => rows.slice(0, 5)),
  ]);

  const flaggedAmount = flagged.reduce((sum, c) => sum + c.amount, 0);

  return {
    representative: rep,
    summary,
    eligibleCount: eligible,
    // Flagged commissions are deliberately surfaced rather than hidden. They are
    // excluded from every payable figure, so without this an admin would see a
    // representative with stuck earnings and no explanation of why.
    flaggedCommissions: flagged,
    flaggedCount: flagged.length,
    flaggedAmount,
    approvedCount: approved._count,
    approvedAmount: approved._sum.amount ?? 0,
    openPayout,
    recentPayouts: recent,
    blockedReason:
      rep.status !== "ACTIVE"
        ? `Representative is ${rep.status.toLowerCase()}.`
        : openPayout
        ? `Payout ${openPayout.payoutCode} is still open.`
        : (approved._sum.amount ?? 0) === 0
        ? flagged.length > 0
          ? `No approved commissions are waiting to be paid. ${flagged.length} flagged commission${
              flagged.length === 1 ? " is" : "s are"
            } awaiting review (Rs. ${flaggedAmount.toLocaleString("en-LK")}).`
          : "No approved commissions are waiting to be paid."
        : null,
  };
}
