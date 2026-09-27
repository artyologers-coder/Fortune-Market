import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { isFeatureEnabled } from "@/lib/feature-flags";
import {
  approveProducerWithPayment,
  verifyRegistrationPayment,
  markPaymentUnderReview,
  waiveRegistrationPayment,
  markPaymentFailed,
  rejectProducerRegistration,
  refundRegistrationPayment,
  ApprovalStateError,
} from "@/lib/producer-approval";

/**
 * The admin registration-payment queue.
 *
 * Every action here changes money or the right to earn it, so the admin identity
 * is taken from the session and the target is the payment id in the path. There
 * is no body field that can name an actor or a producer.
 */
async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  if (session.user.role !== "ADMIN") return null;
  return { id: session.user.id, role: "ADMIN" as const };
}

export async function GET(req: NextRequest) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }
  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const status = req.nextUrl.searchParams.get("status") ?? "PENDING,UNDER_REVIEW";
    const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
    const take = Math.min(
      Math.max(parseInt(req.nextUrl.searchParams.get("take") ?? "50") || 50, 1),
      200
    );

    const payments = await prisma.producerRegistrationPayment.findMany({
      where: { status: { in: statuses } },
      orderBy: { createdAt: "asc" },
      take,
      select: {
        id: true,
        kind: true,
        amount: true,
        currency: true,
        status: true,
        method: true,
        feeRequired: true,
        feeBasis: true,
        reference: true,
        notes: true,
        paidAt: true,
        waivedAt: true,
        waiveReason: true,
        verifiedAt: true,
        createdAt: true,
        producer: {
          select: {
            id: true,
            businessName: true,
            location: true,
            district: true,
            phone: true,
            businessRegistrationNo: true,
            verificationStatus: true,
            userId: true,
            referral: {
              select: {
                referralCode: true,
                status: true,
                representative: {
                  select: { id: true, code: true, fullName: true, status: true },
                },
              },
            },
          },
        },
        // The commission this payment has already produced, if any. Needed so an
        // admin can see that a payment was approved before deciding to refund.
        commissions: {
          select: { id: true, commissionCode: true, amount: true, status: true },
        },
      },
    });

    // Awaits inside admin views are exposed, so resolve the display names here.
    const userIds = payments.map((p) => p.producer.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true, email: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));

    return NextResponse.json({
      payments: payments.map((p) => ({
        ...p,
        producer: {
          ...p.producer,
          user: byId.get(p.producer.userId) ?? null,
        },
      })),
    });
  } catch (error) {
    console.error("Registration payment list error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { paymentId: string } }
) {
  if (!isFeatureEnabled("REPRESENTATIVE_SYSTEM")) {
    return NextResponse.json({ error: "Feature not available" }, { status: 403 });
  }

  try {
    const admin = await requireAdmin();
    if (!admin) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { paymentId } = params;
    if (!paymentId) {
      return NextResponse.json({ error: "Payment id is required" }, { status: 400 });
    }

    const action = req.nextUrl.searchParams.get("action");
    const body = await req.json().catch(() => ({}) as Record<string, unknown>);
    const str = (v: unknown) => (typeof v === "string" ? v : "");
    const notes = str(body.notes);
    const reason = str(body.reason);

    switch (action) {
      case "verify": {
        const result = await verifyRegistrationPayment(paymentId, admin, {
          reference: str(body.reference),
          notes,
        });
        return NextResponse.json({ message: "Payment verified.", payment: result });
      }
      case "under-review":
        return NextResponse.json({
          message: "Payment moved to under review.",
          payment: await markPaymentUnderReview(paymentId, admin, notes),
        });
      case "waive": {
        const result = await waiveRegistrationPayment(paymentId, admin, reason);
        return NextResponse.json({ message: "Payment waived.", payment: result });
      }
      case "fail":
        return NextResponse.json({
          message: "Payment marked failed.",
          payment: await markPaymentFailed(paymentId, admin, reason),
        });
      case "approve": {
        const result = await approveProducerWithPayment(paymentId, admin, { notes });
        return NextResponse.json({
          message: result.alreadyApproved
            ? "This producer was already approved; nothing was duplicated."
            : "Payment verified and producer approved.",
          ...result,
        });
      }
      case "reject":
        return NextResponse.json({
          message: "Producer rejected.",
          producer: await rejectProducerRegistration(paymentId, admin, reason),
        });
      case "refund":
        return NextResponse.json({
          message: "Payment refunded.",
          payment: await refundRegistrationPayment(paymentId, admin, reason),
        });
      default:
        return NextResponse.json(
          {
            error:
              "Unknown action. Use verify, under-review, waive, fail, approve, reject or refund.",
          },
          { status: 400 }
        );
    }
  } catch (error) {
    if (error instanceof ApprovalStateError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error("Registration payment action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
