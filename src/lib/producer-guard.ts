import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import { membershipIsActive } from "@/lib/producer-membership";

export class ProducerGuardError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function producerGuardErrorResponse(e: unknown) {
  if (e instanceof ProducerGuardError) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  console.error("Producer guard error:", e);
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}

export async function requireApprovedProducer() {
  const session = await getServerSession(authOptions);
  const userId = session?.user?.id;
  const role = (session?.user as { role?: string } | undefined)?.role;

  if (!userId || role !== "PRODUCER") {
    throw new ProducerGuardError(401, "Unauthorized");
  }

  const producer = await prisma.producer.findUnique({ where: { userId } });
  if (!producer) {
    throw new ProducerGuardError(403, "Producer profile not found");
  }

  if (producer.verificationStatus !== "APPROVED") {
    throw new ProducerGuardError(
      403,
      "Your producer account is awaiting approval. You can list and edit products once an admin approves your profile."
    );
  }

  if (!membershipIsActive(producer)) {
    throw new ProducerGuardError(
      403,
      "Your producer membership has expired. Please contact an admin to renew."
    );
  }

  return producer;
}

export { producerGuardErrorResponse };