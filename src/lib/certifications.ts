import type { CertificationEntry } from "@/components/product/certifications-input";

export function parseCertifications(value: unknown): CertificationEntry[] {
  if (Array.isArray(value)) {
    return value.filter(
      (e): e is CertificationEntry =>
        !!e && typeof e === "object" && "type" in e && "number" in e
    );
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parseCertifications(parsed);
    } catch {
      return [];
    }
  }
  return [];
}

export function stringifyCertifications(value: CertificationEntry[]): string {
  return JSON.stringify(
    Array.isArray(value)
      ? value.filter((e) => e && typeof e.type === "string" && e.type.trim())
      : []
  );
}
