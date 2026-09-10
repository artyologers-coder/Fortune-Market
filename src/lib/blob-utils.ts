import { put, del } from "@vercel/blob";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_FILE_SIZE = 3 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return "Only JPG, PNG, WebP, or GIF images are allowed";
  }
  if (file.size > MAX_FILE_SIZE) {
    return "Image must be under 3 MB";
  }
  return null;
}

export async function uploadImage(
  file: File,
  folder: "products" | "creative" = "products"
): Promise<{ url: string }> {
  const error = validateImageFile(file);
  if (error) throw new Error(error);

  const extension = file.name.split(".").pop() || "jpg";
  const pathname = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const blob = await put(pathname, file, { access: "public" });
  return { url: blob.url };
}

export async function deleteImages(urls: string[]): Promise<void> {
  if (urls.length === 0) return;
  try {
    await del(urls);
  } catch (error) {
    console.error("Blob cleanup failed:", error);
  }
}
