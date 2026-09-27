import { prisma } from "@/lib/prisma";

/**
 * In-app notifications.
 *
 * The project has no email or SMS delivery, and introducing a provider was out
 * of scope, so this is deliberately in-app only: a row plus an unread badge in
 * the header. Everything sensitive to a notification (status changes, payment
 * confirmations) is also written to the audit trail — notifications are a
 * convenience, the audit log is the record of truth.
 */

export type NotificationType =
  | "APPLICATION_APPROVED"
  | "APPLICATION_REJECTED"
  | "APPLICATION_INFO_REQUESTED"
  | "PRODUCER_REGISTERED"
  | "PAYMENT_CONFIRMED"
  | "PAYMENT_PENDING"
  | "COMMISSION_EARNED"
  | "COMMISSION_APPROVED"
  | "COMMISSION_PAID"
  | "COMMISSION_REVERSED"
  | "LEAD_STATUS_CHANGED"
  | "ACCOUNT_SUSPENDED"
  | "ACCOUNT_REINSTATED"
  | "GUIDE_UPDATED"
  | "SETTINGS_UPDATED";

export type CreateNotificationInput = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string | null;
  link?: string | null;
  /**
   * The row this notification describes, so it can be removed with that row.
   * Use the Prisma model name, e.g. "RepresentativeApplication". Both fields
   * together or neither: a half-set subject cannot be matched reliably.
   */
  subjectType?: string | null;
  subjectId?: string | null;
};

function subjectData(input: CreateNotificationInput) {
  // Refusing a half-set subject is deliberate. Silently dropping subjectId would
  // leave notifications that look clean but can never be cleaned up again.
  if (input.subjectType && !input.subjectId) {
    throw new Error(
      `createNotification: subjectType "${input.subjectType}" was given without a subjectId.`
    );
  }
  if (input.subjectId && !input.subjectType) {
    throw new Error(
      `createNotification: subjectId "${input.subjectId}" was given without a subjectType.`
    );
  }
  return {
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId ?? null,
  };
}

export async function createNotification(input: CreateNotificationInput) {
  return prisma.notification.create({
    data: {
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      ...subjectData(input),
    },
  });
}

export async function createNotifications(inputs: CreateNotificationInput[]) {
  if (inputs.length === 0) return 0;
  const result = await prisma.notification.createMany({
    data: inputs.map((input) => ({
      userId: input.userId,
      type: input.type,
      title: input.title,
      body: input.body ?? null,
      link: input.link ?? null,
      ...subjectData(input),
    })),
  });
  return result.count;
}

/**
 * Removes every notification about a given subject, whoever received it.
 *
 * Call this from whatever deletes the subject. Notifications are addressed to
 * the *other* party — an admin is told about an application, a representative
 * is told about a payout — so a cascade on User never reaches them, and they
 * would otherwise outlive the row they describe.
 */
export async function deleteNotificationsForSubject(
  subjectType: string,
  subjectId: string
): Promise<number> {
  const { count } = await prisma.notification.deleteMany({
    where: { subjectType, subjectId },
  });
  return count;
}

export async function getUnreadCount(userId: string): Promise<number> {
  return prisma.notification.count({
    where: { userId, readAt: null },
  });
}

export async function listNotifications(
  userId: string,
  options: { page?: number; perPage?: number; unreadOnly?: boolean } = {}
) {
  const page = Math.max(1, options.page ?? 1);
  const perPage = Math.min(100, Math.max(1, options.perPage ?? 20));

  const where = {
    userId,
    ...(options.unreadOnly ? { readAt: null } : {}),
  };

  const [notifications, total, unread] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.notification.count({ where }),
    getUnreadCount(userId),
  ]);

  return {
    notifications,
    unread,
    pagination: {
      page,
      perPage,
      total,
      totalPages: Math.max(1, Math.ceil(total / perPage)),
    },
  };
}

export async function markAsRead(userId: string, ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { count } = await prisma.notification.updateMany({
    // The userId in the where clause is the authorisation: a caller can only
    // ever mark their own notifications read, whatever ids they pass.
    where: { id: { in: ids }, userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}

export async function markAllAsRead(userId: string): Promise<number> {
  const { count } = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
  return count;
}
