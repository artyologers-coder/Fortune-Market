import sharp from "sharp";
import { put } from "@vercel/blob";

export const CREATIVE_SIZE = 1000;
export const CREATIVE_MAX_BYTES = 3 * 1024 * 1024;

export async function resizeToCanvas(buf: Buffer): Promise<Buffer> {
  return sharp(buf, { failOn: "none" })
    .resize(CREATIVE_SIZE, CREATIVE_SIZE, { fit: "cover" })
    .png()
    .toBuffer();
}

export async function encodeWithinLimit(buf: Buffer): Promise<Buffer> {
  const canvas = await resizeToCanvas(buf);
  const qualities = [88, 82, 76, 68, 55, 45];
  let last = Buffer.alloc(0);
  for (const quality of qualities) {
    last = await sharp(canvas)
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
    if (last.length <= CREATIVE_MAX_BYTES) return last;
  }
  return last;
}

export async function uploadCreative(final: Buffer): Promise<string> {
  const pathname = `creative/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.jpg`;
  const blob = await put(pathname, final, {
    access: "public",
    contentType: "image/jpeg",
  });
  return blob.url;
}