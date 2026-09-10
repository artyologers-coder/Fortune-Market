export function slugify(input: string): string {
  const base = input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

  return base || "product";
}

export async function uniqueSlug(
  base: string,
  takenChecker: (candidate: string) => Promise<boolean>
): Promise<string> {
  const clean = slugify(base);
  let candidate = clean;
  let suffix = 2;
  while (await takenChecker(candidate)) {
    candidate = `${clean}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}