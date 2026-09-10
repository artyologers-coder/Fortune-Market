import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { prisma } from "@/lib/prisma";
import { CreativeError } from "@/lib/creative/errors";

export class CreativeRouteError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function requireProducer() {
  if (!isFeatureEnabled("FORTUNE_CREATIVE")) {
    throw new CreativeRouteError(404, "Fortune Creative is not available yet.");
  }

  const session = await getServerSession(authOptions);
  const userId: string | null | undefined = session?.user?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!userId || role !== "PRODUCER") {
    throw new CreativeRouteError(401, "Unauthorized");
  }

  const producer = await prisma.producer.findUnique({
    where: { userId },
  });
  if (!producer) throw new CreativeRouteError(401, "Unauthorized");

  if (producer.verificationStatus !== "APPROVED") {
    throw new CreativeRouteError(
      403,
      "Your producer account is awaiting approval. Fortune Creative will be available once an admin approves your profile."
    );
  }

  return producer;
}

export function creativeErrorResponse(e: unknown) {
  if (e instanceof CreativeRouteError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  if (e instanceof CreativeError) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
  console.error("Fortune Creative route error:", e);
  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}