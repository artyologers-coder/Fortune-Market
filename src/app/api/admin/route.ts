import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const [
      totalProducers,
      totalProducts,
      totalOrders,
      pendingVerifications,
      pendingModeration,
    ] = await Promise.all([
      prisma.producer.count(),
      prisma.product.count(),
      prisma.order.count(),
      prisma.producer.count({ where: { verificationStatus: "PENDING" } }),
      prisma.product.count({ where: { flagged: true } }),
    ]);

    return NextResponse.json({
      stats: {
        totalProducers,
        totalProducts,
        totalOrders,
        pendingVerifications,
        pendingModeration,
      },
    });
  } catch (error) {
    console.error("Admin stats error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = session.user.role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { action, targetId, targetType } = await req.json();

    if (targetType === "producer") {
      if (action === "approve") {
        await prisma.producer.update({
          where: { id: targetId },
          data: { verificationStatus: "APPROVED", verifiedAt: new Date() },
        });
      } else if (action === "reject") {
        await prisma.producer.update({
          where: { id: targetId },
          data: { verificationStatus: "REJECTED" },
        });
      }
    } else if (targetType === "product") {
      if (action === "flag") {
        await prisma.product.update({
          where: { id: targetId },
          data: { flagged: true },
        });
      } else if (action === "unflag") {
        await prisma.product.update({
          where: { id: targetId },
          data: { flagged: false },
        });
      }
    } else if (targetType === "review") {
      if (action === "approve") {
        await prisma.review.update({
          where: { id: targetId },
          data: { approved: true },
        });
      } else if (action === "reject") {
        await prisma.review.update({
          where: { id: targetId },
          data: { approved: false },
        });
      }
    } else if (targetType === "offer") {
      if (action === "approve") {
        await prisma.offer.update({
          where: { id: targetId },
          data: { status: "APPROVED" },
        });
      } else if (action === "reject") {
        await prisma.offer.update({
          where: { id: targetId },
          data: { status: "REJECTED" },
        });
      }
    }

    return NextResponse.json({ message: "Action completed" });
  } catch (error) {
    console.error("Admin action error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
