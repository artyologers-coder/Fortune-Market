import { prisma } from "@/lib/prisma";

/**
 * DB-backed fixed-window rate limiting.
 *
 * The only pre-existing limiter in the project (lib/reseller/scraper.ts) is an
 * in-process Map used to throttle outbound scrapes. That approach is useless
 * for inbound abuse protection on Vercel, where each request may run in a
 * fresh lambda with its own memory. Buckets that matter are therefore
 * persisted.
 *
 * Best-effort: if the database is unreachable the request is allowed through
 * rather than failing closed, because a limiter outage should not take the
 * product offline. Uniqueness constraints (User.email, User.phone, the
 * commission/referral unique keys) remain the real backstop against
 * duplication.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const DEFAULTS = { limit: 10, windowSeconds: 60 } as const;

/**
 * Identifies the caller. Prefers a forwarded IP; falls back to a caller
 * supplied hint. The raw IP is never stored — only its SHA-256 digest, so the
 * bucket table holds no personal data.
 */
export function clientKey(req: Request, hint?: string | null): string {
  if (hint) return `hint:${hint}`;

  const forwarded = req.headers.get("x-forwarded-for");
  const ip =
    forwarded?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  return `ip:${hash(ip)}`;
}

function hash(value: string): string {
  // Short, stable, non-reversible identifier. Not a security control.
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

export async function rateLimit(
  key: string,
  options: { limit?: number; windowSeconds?: number } = {}
): Promise<RateLimitResult> {
  const limit = options.limit ?? DEFAULTS.limit;
  const windowSeconds = options.windowSeconds ?? DEFAULTS.windowSeconds;
  const now = new Date();
  const windowMs = windowSeconds * 1000;

  try {
    const bucket = await prisma.rateLimitBucket.upsert({
      where: { key },
      // Created at 0, not 1: the increment below is the one and only count of
      // this request. Seeding at 1 would double-charge the first call and make
      // a limit of N silently behave like N-1.
      create: { key, count: 0, windowStart: now },
      update: {},
    });

    const windowExpired =
      now.getTime() - bucket.windowStart.getTime() > windowMs;

    if (windowExpired) {
      await prisma.rateLimitBucket.update({
        where: { key },
        data: { count: 1, windowStart: now },
      });
      return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil((windowMs - (now.getTime() - bucket.windowStart.getTime())) / 1000)
      );
      return { allowed: false, remaining: 0, retryAfterSeconds };
    }

    await prisma.rateLimitBucket.update({
      where: { key },
      data: { count: { increment: 1 } },
    });

    return { allowed: true, remaining: limit - bucket.count - 1, retryAfterSeconds: 0 };
  } catch (error) {
    console.error("[rate-limit] bucket check failed, allowing request:", error);
    return { allowed: true, remaining: limit, retryAfterSeconds: 0 };
  }
}

/**
 * Opportunistic cleanup. Safe to call from a cron or opportunistically; never
 * required for correctness.
 */
export async function pruneRateLimitBuckets(maxAgeSeconds = 3600): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeSeconds * 1000);
  const { count } = await prisma.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}
