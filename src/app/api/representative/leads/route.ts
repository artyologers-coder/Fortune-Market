import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireActiveRepresentative,
  requireRepresentative,
  representativeGuardErrorResponse,
} from "@/lib/representative-guard";
import {
  LeadValidationError,
  createLeadForRepresentative,
  updateLeadForRepresentative,
  getLeadCounts,
} from "@/lib/representative-lead";

export const dynamic = "force-dynamic";

/**
 * The representative's own leads.
 *
 * Every query is scoped by the `representativeId` resolved from the session —
 * there is no representative id in the path or body, so one representative can
 * never read or write another's leads.
 */
export async function GET() {
  try {
    const rep = await requireRepresentative();

    const [leads, counts] = await Promise.all([
      prisma.representativeLead.findMany({
        where: { representativeId: rep.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        select: {
          id: true,
          leadCode: true,
          contactName: true,
          phone: true,
          whatsapp: true,
          district: true,
          area: true,
          productCategory: true,
          notes: true,
          status: true,
          statusLocked: true,
          duplicateSuspect: true,
          duplicateNote: true,
          producerId: true,
          contactedAt: true,
          convertedAt: true,
          createdAt: true,
        },
      }),
      getLeadCounts(rep.id),
    ]);

    return NextResponse.json({ leads, counts });
  } catch (error) {
    return representativeGuardErrorResponse(error);
  }
}

/** Records a new lead the representative has spoken to. */
export async function POST(request: Request) {
  try {
    // Creating a lead is new business, so it needs an ACTIVE representative.
    const rep = await requireActiveRepresentative();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new LeadValidationError("body", "Invalid request.");
    }

    const lead = await createLeadForRepresentative(rep.id, {
      contactName: String(body.contactName ?? ""),
      phone: String(body.phone ?? ""),
      whatsapp: body.whatsapp ? String(body.whatsapp) : null,
      email: body.email ? String(body.email) : null,
      district: String(body.district ?? ""),
      area: body.area ? String(body.area) : null,
      productCategory: body.productCategory ? String(body.productCategory) : null,
      notes: body.notes ? String(body.notes) : null,
      producerName: body.producerName ? String(body.producerName) : null,
    });

    return NextResponse.json({ lead }, { status: 201 });
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    }
    if (typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002") {
      return NextResponse.json(
        { error: "That lead code could not be allocated. Please try again.", field: "contactName" },
        { status: 409 }
      );
    }
    console.error("Representative lead create error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Moves a lead along. */
export async function PATCH(request: Request) {
  try {
    const rep = await requireActiveRepresentative();

    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !body.leadId) {
      throw new LeadValidationError("leadId", "A lead id is required.");
    }

    const lead = await updateLeadForRepresentative(rep.id, String(body.leadId), {
      status: body.status !== undefined ? String(body.status) : undefined,
      notes: body.notes !== undefined ? String(body.notes) : undefined,
      area: body.area !== undefined ? String(body.area) : undefined,
      productCategory:
        body.productCategory !== undefined ? String(body.productCategory) : undefined,
    });

    return NextResponse.json({ lead });
  } catch (error) {
    if (error instanceof LeadValidationError) {
      return NextResponse.json({ error: error.message, field: error.field }, { status: 400 });
    }
    console.error("Representative lead update error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
