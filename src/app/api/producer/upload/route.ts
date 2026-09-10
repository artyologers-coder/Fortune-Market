import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireApprovedProducer, producerGuardErrorResponse } from "@/lib/producer-guard";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    await requireApprovedProducer();

    const formData = await req.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: "Only JPG, PNG, WebP, or GIF images are allowed" },
        { status: 400 }
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Image must be under 3 MB" }, { status: 400 });
    }

    const extension = file.name.split(".").pop() || "jpg";
    const pathname = `products/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;

    const blob = await put(pathname, file, { access: "public" });

    return NextResponse.json({ url: blob.url });
  } catch (error) {
    console.error("Producer upload error:", error);
    return producerGuardErrorResponse(error);
  }
}