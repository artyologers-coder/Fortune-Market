import { prisma } from "@/lib/prisma";
import type { Tx } from "@/lib/representative-code";
import {
  createCommissionForProducer,
  reverseCommission,
  ACTIVE_PAYOUT_STATUSES,
} from "@/lib/commission";
import { activateMembershipInTransaction } from "@/lib/producer-membership";
import { recordAudit } from "@/lib/audit";
import { createNotification } from "@/lib/notifications";

/**
 * The producer approval gate.
 *
 * The old flow (src/app/api/admin/route.ts) approved a producer with a bare
 * `update`, granted the membership with a second call on the global client, and
 * never created a commission. That is three failure modes in one click:
 *
 *   - crash between the approve and the membership leaves a live producer with
 *     no membership and no way to sell;
 *   - the commission, created elsewhere or not at all, means a representative
 *     who referred the producer earns nothing and has no way to tell why;
 *   - a referred producer could be approved while their Rs.1,200 was still
 *     PENDING, which is free revenue and a rep-commission fraud vector.
 *
 * Everything that must agree now agrees in one transaction, and the producer
 * row is locked for its duration so two admins cannot both create a commission.
 */
export class ApprovalStateError extends Error {}

export type AdminActor = { id: string; role: "ADMIN" };

/** Blocks a second admin from approving the same producer concurrently. */
async function lockProducer(tx: Tx, producerId: string): Promise<void> {
  await tx.$queryRaw`SELECT id FROM "Producer" WHERE id = ${producerId} FOR UPDATE`;
}

const PAYMENT_REASONS: Record<string, string> = {
  PENDING: "the registration payment has not been verified yet",
  UNDER_REVIEW: "the registration payment is still under review",
  FAILED: "the registration payment was marked failed",
  CANCELLED: "the registration payment was cancelled",
  REFUNDED: "the registration payment was refunded",
};

/**
 * Decides whether the money question is settled.
 *
 * `feeRequired` is what separates "this producer legitimately owes nothing"
 * from "someone let this producer off a fee they owed":
 *
 *   - feeRequired = true  -> must be PAID, or WAIVED by a named admin. A
 *     system WAIVED (waivedById null) is not good enough.
 *   - feeRequired = false -> they owe nothing, so PAID or WAIVED both clear it.
 *     Registration writes this case as a zero-amount WAIVED row precisely so
 *     "no fee due" is not confused with "we forgot to record the decision".
 */
function assertPaymentCleared(payment: {
  status: string;
  feeRequired: boolean;
  waivedById: string | null;
  amount: number;
}): void {
  if (payment.status === "PAID") return;

  if (payment.status === "WAIVED") {
    if (payment.feeRequired && !payment.waivedById) {
      throw new ApprovalStateError(
        "This producer owes the registration fee and the waiver was system-generated, not approved by an admin. Verify the payment or waive it explicitly."
      );
    }
    return;
  }

  const reason = PAYMENT_REASONS[payment.status];
  throw new ApprovalStateError(
    reason
      ? `Cannot approve: ${reason}.`
      : `Cannot approve: the payment is in an unrecognised state (${payment.status}).`
  );
}

type PaymentForApproval = {
  id: string;
  producerId: string;
  kind: string;
  amount: number;
  currency: string;
  status: string;
  feeRequired: boolean;
  feeBasis: string | null;
  waivedById: string | null;
};

export type ApprovalResult = {
  producerId: string;
  businessName: string;
  membershipId: string | null;
  membershipExpiresAt: Date | null;
  paymentStatus: string;
  alreadyApproved: boolean;
  commission:
    | { created: true; id: string; commissionCode: string; amount: number }
    | { created: false; code: string; reason: string };
};

/**
 * Verify the payment, approve the producer, grant the membership and create the
 * representative's commission, atomically.
 *
 * Idempotent: re-approving an already-approved producer returns the existing
 * state and re-runs the commission step, which is itself idempotent. That makes
 * it safe to retry after a timeout without risking a duplicate commission or a
 * second membership.
 */
export async function approveProducerWithPayment(
  paymentId: string,
  admin: AdminActor,
  options: { notes?: string } = {}
): Promise<ApprovalResult> {
  const existing = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, producerId: true },
  });
  if (!existing) throw new ApprovalStateError("Registration payment not found.");

  const result = await prisma.$transaction(
    async (tx) => {
      await lockProducer(tx, existing.producerId);

      // Re-read after the lock: the other admin may have just committed.
      const payment = await tx.producerRegistrationPayment.findUniqueOrThrow({
        where: { id: paymentId },
        select: {
          id: true,
          producerId: true,
          kind: true,
          amount: true,
          currency: true,
          status: true,
          feeRequired: true,
          feeBasis: true,
          waivedById: true,
        },
      });
      const producer = await tx.producer.findUniqueOrThrow({
        where: { id: payment.producerId },
        select: {
          id: true,
          businessName: true,
          verificationStatus: true,
          referral: {
            select: { id: true, representative: { select: { id: true, userId: true } } },
          },
        },
      });

      const alreadyApproved = producer.verificationStatus === "APPROVED";
      if (alreadyApproved) {
        // Refuse a REJECTED producer being quietly re-approved behind a stale
        // payment, but allow a re-approval to be re-run.
        if (payment.status === "REFUNDED" || payment.status === "CANCELLED") {
          throw new ApprovalStateError(
            `Cannot approve: ${PAYMENT_REASONS[payment.status]}.`
          );
        }
      } else {
        assertPaymentCleared(payment as PaymentForApproval);
      }

      const now = new Date();

      if (!alreadyApproved) {
        await tx.producer.update({
          where: { id: producer.id },
          data: { verificationStatus: "APPROVED", verifiedAt: now },
        });
      }

      // Free approved producers still get the full 365 days; so does everyone
      // else, because the membership is what makes a producer visible at all.
      const membership = await activateMembershipInTransaction(tx, producer.id);

      // The commission is derived, never passed in. Eligibility re-reads the
      // referral, the producer and the payment inside this same transaction, so
      // a rep cannot be credited for a referral that was reversed a moment ago.
      const commission = await createCommissionForProducer(tx, {
        producerId: producer.id,
        registrationPaymentId: payment.id,
        kind: "INITIAL" as const,
      });

      const commissionOut = "skipped" in commission
        ? {
            created: false as const,
            code: commission.skipped.code,
            reason: commission.skipped.reason,
          }
        : {
            created: true as const,
            id: commission.id,
            commissionCode: commission.commissionCode,
            amount: commission.amount,
          };

      return {
        producerId: producer.id,
        businessName: producer.businessName,
        membershipId: membership?.membershipId ?? null,
        membershipExpiresAt: membership?.membershipExpiresAt ?? null,
        paymentStatus: payment.status,
        alreadyApproved,
        commission: commissionOut,
        repUserId: producer.referral?.representative.userId ?? null,
        repId: producer.referral?.representative.id ?? null,
        notes: options.notes ?? null,
      };
    },
    { timeout: 15000, maxWait: 5000 }
  );

  // Best-effort, after the commit. The money state is already durable; a failed
  // notification must not be able to roll back an approval, and the admin UI
  // surfaces the ledger rather than the notification.
  const followUps = await Promise.allSettled([
    recordAudit({
      actor: admin,
      action: result.alreadyApproved ? "PRODUCER_REAPPROVED" : "PRODUCER_APPROVED",
      entityType: "Producer",
      entityId: result.producerId,
      representativeId: result.repId,
      newValue: {
        paymentId,
        paymentStatus: result.paymentStatus,
        membershipId: result.membershipId,
        commission: result.commission,
      },
      metadata: { notes: result.notes },
    }),
    createNotification({
      userId: (
        await prisma.producer.findUniqueOrThrow({
          where: { id: result.producerId },
          select: { userId: true },
        })
      ).userId,
      type: result.paymentStatus === "PAID" ? "PAYMENT_CONFIRMED" : "PAYMENT_PENDING",
      subjectType: "Producer",
      subjectId: result.producerId,
      title: "Your registration is approved",
      body:
        result.paymentStatus === "PAID"
          ? "Your payment was verified and your producer account is now approved. Your membership is active."
          : "Your producer account is now approved and your membership is active.",
      link: "/producer/dashboard",
    }),
    result.repUserId
      ? createNotification({
          userId: result.repUserId,
          type: "COMMISSION_EARNED",
          // Only a real commission row can be a subject. When none was created
          // the event is about the approval decision, not a commission.
          subjectType: result.commission.created ? "RepresentativeCommission" : null,
          subjectId: result.commission.created ? result.commission.id : null,
          title: "You earned a commission",
          body: result.commission.created
            ? `Rs. ${result.commission.amount.toLocaleString("en-LK")} for the producer you referred (${result.businessName}).`
            : "A producer you referred was approved. No commission was created: " +
              `${result.commission.reason}`,
          link: "/representative/earnings",
        })
      : Promise.resolve(),
  ]);

  const followUpFailure = followUps.find((f) => f.status === "rejected");
  if (followUpFailure) {
    console.error("Approval committed but a follow-up failed:", followUpFailure.reason);
  }

  const { repUserId: _repUserId, repId: _repId, notes: _notes, ...out } = result;
  return out;
}

function requireReason(reason: string, minLength: number): string {
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < minLength) {
    throw new ApprovalStateError(
      `A reason of at least ${minLength} characters is required.`
    );
  }
  return trimmed;
}

/** Marks a payment as received. UNDER_REVIEW -> PAID is allowed; PAID is a no-op. */
export async function verifyRegistrationPayment(
  paymentId: string,
  admin: AdminActor,
  options: { reference?: string; notes?: string } = {}
): Promise<{ id: string; status: string; verifiedAt: Date }> {
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, amount: true },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");
  if (payment.status === "PAID") {
    const already = await prisma.producerRegistrationPayment.findUniqueOrThrow({
      where: { id: paymentId },
      select: { id: true, status: true, verifiedAt: true },
    });
    return { id: already.id, status: already.status, verifiedAt: already.verifiedAt! };
  }
  if (payment.status === "WAIVED" || payment.status === "REFUNDED") {
    throw new ApprovalStateError(
      `Cannot verify a ${payment.status.toLowerCase()} payment. Waive it or refund it instead.`
    );
  }

  const updated = await prisma.producerRegistrationPayment.update({
    where: { id: paymentId },
    data: {
      status: "PAID",
      paidAt: new Date(),
      verifiedById: admin.id,
      verifiedAt: new Date(),
      reference: options.reference?.trim() || undefined,
      notes: options.notes?.trim() || undefined,
    },
    select: { id: true, status: true, verifiedAt: true },
  });

  await recordAudit({
    actor: admin,
    action: "PAYMENT_VERIFIED",
    entityType: "ProducerRegistrationPayment",
    entityId: paymentId,
    newValue: { status: "PAID", amount: payment.amount, reference: options.reference ?? null },
  });

  return { id: updated.id, status: updated.status, verifiedAt: updated.verifiedAt! };
}

/** PENDING/UNDER_REVIEW -> UNDER_REVIEW, so the queue shows it is being chased. */
export async function markPaymentUnderReview(
  paymentId: string,
  admin: AdminActor,
  notes?: string
): Promise<{ id: string; status: string }> {
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");
  if (payment.status !== "PENDING") {
    throw new ApprovalStateError(
      `Only a pending payment can be moved to under review (this one is ${payment.status}).`
    );
  }
  const updated = await prisma.producerRegistrationPayment.update({
    where: { id: paymentId },
    data: { status: "UNDER_REVIEW", notes: notes?.trim() || undefined },
    select: { id: true, status: true },
  });
  await recordAudit({
    actor: admin,
    action: "PAYMENT_UNDER_REVIEW",
    entityType: "ProducerRegistrationPayment",
    entityId: paymentId,
  });
  return updated;
}

/**
 * Explicit admin waiver. This is the ONLY way a producer who owes the fee keeps
 * the commission, and it is always attributable: waivedById and the reason are
 * written in the same statement, so there is never a waived fee with no name
 * attached to it.
 */
export async function waiveRegistrationPayment(
  paymentId: string,
  admin: AdminActor,
  reason: string
): Promise<{ id: string; status: string; waivedById: string }> {
  const why = requireReason(reason, 10);
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true, feeRequired: true },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");
  if (payment.status === "PAID") {
    throw new ApprovalStateError("Cannot waive a verified payment. Refund it instead.");
  }
  if (payment.status === "REFUNDED" || payment.status === "CANCELLED") {
    throw new ApprovalStateError(`Cannot waive a ${payment.status.toLowerCase()} payment.`);
  }

  const updated = await prisma.producerRegistrationPayment.update({
    where: { id: paymentId },
    data: {
      status: "WAIVED",
      waivedAt: new Date(),
      waivedById: admin.id,
      waiveReason: why,
    },
    select: { id: true, status: true, waivedById: true },
  });

  await recordAudit({
    actor: admin,
    action: "PAYMENT_WAIVED",
    entityType: "ProducerRegistrationPayment",
    entityId: paymentId,
    newValue: { status: "WAIVED", reason: why, feeRequired: payment.feeRequired },
  });

  return { ...updated, waivedById: updated.waivedById! };
}

/** PENDING/UNDER_REVIEW -> FAILED. The producer row is left untouched. */
export async function markPaymentFailed(
  paymentId: string,
  admin: AdminActor,
  reason: string
): Promise<{ id: string; status: string }> {
  const why = requireReason(reason, 10);
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { id: true, status: true },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");
  if (payment.status !== "PENDING" && payment.status !== "UNDER_REVIEW") {
    throw new ApprovalStateError(
      `Only a pending or under-review payment can be failed (this one is ${payment.status}).`
    );
  }
  const updated = await prisma.producerRegistrationPayment.update({
    where: { id: paymentId },
    data: { status: "FAILED", notes: why },
    select: { id: true, status: true },
  });
  await recordAudit({
    actor: admin,
    action: "PAYMENT_FAILED",
    entityType: "ProducerRegistrationPayment",
    entityId: paymentId,
    newValue: { reason: why },
  });
  return updated;
}

/**
 * Refuses to approve a producer outright (e.g. forged documents). Keeps the
 * payment row: the admin queue must still show what was attempted.
 */
export async function rejectProducerRegistration(
  paymentId: string,
  admin: AdminActor,
  reason: string
): Promise<{ producerId: string; businessName: string }> {
  const why = requireReason(reason, 10);
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: { producer: { select: { id: true, businessName: true } } },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");

  await prisma.producer.update({
    where: { id: payment.producer.id },
    data: { verificationStatus: "REJECTED" },
  });

  await recordAudit({
    actor: admin,
    action: "PRODUCER_REJECTED",
    entityType: "Producer",
    entityId: payment.producer.id,
    newValue: { reason: why },
  });

  return {
    producerId: payment.producer.id,
    businessName: payment.producer.businessName,
  };
}

/**
 * Refunds a settled payment and neutralises the commission it earned.
 *
 * A commission that is already inside a payout is refused: the money has left,
 * and unwinding it is a payout decision, not a payment one. An ELIGIBLE
 * commission that has not been approved is cancelled (with a recorded reason)
 * so the representative's balance is corrected while it is still correctable.
 */
export async function refundRegistrationPayment(
  paymentId: string,
  admin: AdminActor,
  reason: string
): Promise<{ id: string; status: string; commission: string }> {
  const why = requireReason(reason, 10);
  const payment = await prisma.producerRegistrationPayment.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      status: true,
      commissions: {
        select: {
          id: true,
          status: true,
          payoutItems: {
            where: { payout: { status: { in: [...ACTIVE_PAYOUT_STATUSES] } } },
            select: { payoutId: true },
            take: 1,
          },
        },
      },
    },
  });
  if (!payment) throw new ApprovalStateError("Registration payment not found.");
  if (payment.status !== "PAID" && payment.status !== "WAIVED") {
    throw new ApprovalStateError(
      `Only a paid or waived payment can be refunded (this one is ${payment.status}).`
    );
  }

  for (const commission of payment.commissions) {
    if (commission.payoutItems.length > 0) {
      throw new ApprovalStateError(
        "This payment has already been included in a payout. Reverse the payout instead of the payment."
      );
    }
  }

  const updated = await prisma.producerRegistrationPayment.update({
    where: { id: paymentId },
    data: { status: "REFUNDED", refundedAt: new Date(), refundReason: why },
    select: { id: true, status: true },
  });

  let commissionOutcome = "none";
  for (const commission of payment.commissions) {
    const result = await reverseCommission(commission.id, why, admin, "CANCEL");
    commissionOutcome = result.status;
  }

  await recordAudit({
    actor: admin,
    action: "PAYMENT_REFUNDED",
    entityType: "ProducerRegistrationPayment",
    entityId: paymentId,
    newValue: { reason: why, commission: commissionOutcome },
  });

  return { ...updated, commission: commissionOutcome };
}
