import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { uploadImage } from "@/lib/blob-utils";
import { requireApprovedProducer, producerGuardErrorResponse } from "@/lib/producer-guard";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    const role = (session?.user as { role?: string })?.role;

    if (role !== "ADMIN" && role !== "PRODUCER") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (role === "PRODUCER") {
      try {
        await requireApprovedProducer();
      } catch (error) {
        return producerGuardErrorResponse(error);
      }
    }

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const result = await uploadImage(file);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload failed";
    console.error("Upload error:", error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
