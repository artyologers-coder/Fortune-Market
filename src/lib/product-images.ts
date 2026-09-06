export function getImagesList(
  images: string | string[] | null | undefined
): string[] {
  if (!images) return [];
  if (Array.isArray(images)) return images.filter(Boolean);
  try {
    const parsed = JSON.parse(images);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch {
    // not JSON
  }
  const trimmed = images.trim();
  return trimmed ? [trimmed] : [];
}

export function getFirstImage(
  images: string | string[] | null | undefined
): string | null {
  const list = getImagesList(images);
  return list[0] || null;
}