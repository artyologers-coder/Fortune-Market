import { prisma } from "@/lib/prisma";

/**
 * Append-only audit trail for the representative programme.
 *
 * Writes are best-effort on purpose: an audit failure must never roll back or
 * block the business action it describes, but it is logged loudly so the gap
 * is visible. There is no update or delete path — history is never edited.
 */

export type AuditActor = {
  id?: string | null;
  role?: string | null;
};

export type AuditInput = {
  actor?: AuditActor | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  representativeId?: string | null;
  previousValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown> | null;
};

function stringify(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function recordAudit(input: AuditInput): Promise<void> {
  try {
    await prisma.representativeAuditLog.create({
      data: {
        actorId: input.actor?.id ?? null,
        actorRole: input.actor?.role ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId ?? null,
        representativeId: input.representativeId ?? null,
        previousValue: stringify(input.previousValue),
        newValue: stringify(input.newValue),
        metadata: stringify(input.metadata),
      },
    });
  } catch (error) {
    console.error(
      `[audit] FAILED to record "${input.action}" on ${input.entityType}:${input.entityId ?? "-"}`,
      error
    );
  }
}

export type AuditFilters = {
  representativeId?: string;
  entityType?: string;
  entityId?: string;
  action?: string;
  from?: Date;
  to?: Date;
  page?: number;
  perPage?: number;
};

export async function listAuditLogs(filters: AuditFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const perPage = Math.min(200, Math.max(1, filters.perPage ?? 50));

  const where = {
    ...(filters.representativeId ? { representativeId: filters.representativeId } : {}),
    ...(filters.entityType ? { entityType: filters.entityType } : {}),
    ...(filters.entityId ? { entityId: filters.entityId } : {}),
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.from || filters.to
      ? {
          createdAt: {
            ...(filters.from ? { gte: filters.from } : {}),
            ...(filters.to ? { lte: filters.to } : {}),
          },
        }
      : {}),
  };

  const [logs, total] = await Promise.all([
    prisma.representativeAuditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        representative: { select: { code: true, fullName: true } },
      },
    }),
    prisma.representativeAuditLog.count({ where }),
  ]);

  return {
    logs,
    pagination: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}
