import { prisma } from "../src/lib/prisma";

/**
 * Residue guard for the verification scripts.
 *
 * Two tables escaped the per-script cleanup for a long time, because they are
 * written by library code rather than by the scripts themselves:
 *
 *   - RepresentativeSettingsRevision: every settings write through
 *     `updateRepresentativeSettings` is permanent by design, so a test that
 *     flips the fee gate leaves an audit row behind. That is the right
 *     behaviour for the product and the wrong behaviour for a test run.
 *   - Notification: application submissions fan out to *every* admin, not just
 *     the test's own users, so `deleteMany({ userId: { in: userIds } })` never
 *     matched them. Deleting a test applicant cascaded the application away and
 *     left the admin holding a permanent unread notification for an
 *     application that no longer existed.
 *
 * Both accumulated silently across runs. This snapshots the tables before the
 * work starts and diffs them afterwards, so a script that leaves anything
 * behind fails loudly with the offending rows named.
 *
 * These scripts point at a dev database and must not be run while real activity
 * is in flight: the diff is by id, so a genuine row created during the run
 * would be reported as residue.
 */

type Snapshot = {
  revisionIds: Set<string>;
  notificationIds: Set<string>;
};

let snapshot: Snapshot | null = null;

export async function beginResidueGuard(): Promise<void> {
  const [revisions, notifications] = await Promise.all([
    prisma.representativeSettingsRevision.findMany({ select: { id: true } }),
    prisma.notification.findMany({ select: { id: true } }),
  ]);
  snapshot = {
    revisionIds: new Set(revisions.map((r) => r.id)),
    notificationIds: new Set(notifications.map((n) => n.id)),
  };
}

/**
 * Returns a human-readable description of anything created since the guard was
 * armed. Empty string means clean.
 */
export async function collectResidue(): Promise<string> {
  if (!snapshot) throw new Error("beginResidueGuard() must be called before collectResidue()");
  const [revisions, notifications] = await Promise.all([
    prisma.representativeSettingsRevision.findMany({ select: { id: true, reason: true } }),
    prisma.notification.findMany({ select: { id: true, type: true, title: true } }),
  ]);

  const lines: string[] = [];
  for (const r of revisions) {
    if (!snapshot.revisionIds.has(r.id)) lines.push(`  settings revision: ${r.reason}`);
  }
  for (const n of notifications) {
    if (!snapshot.notificationIds.has(n.id)) lines.push(`  notification: ${n.type} "${n.title}"`);
  }
  return lines.join("\n");
}

/**
 * Deletes everything created since the guard was armed. No-op if the guard was
 * never armed, so a script may safely call it from a shared cleanup() helper
 * that also runs before the work starts.
 */
export async function purgeResidue(): Promise<void> {
  if (!snapshot) return;
  const [revisions, notifications] = await Promise.all([
    prisma.representativeSettingsRevision.findMany({ select: { id: true } }),
    prisma.notification.findMany({ select: { id: true } }),
  ]);
  const staleRevisions = revisions.filter((r) => !snapshot!.revisionIds.has(r.id)).map((r) => r.id);
  const staleNotifications = notifications
    .filter((n) => !snapshot!.notificationIds.has(n.id))
    .map((n) => n.id);
  if (staleRevisions.length > 0) {
    await prisma.representativeSettingsRevision.deleteMany({ where: { id: { in: staleRevisions } } });
  }
  if (staleNotifications.length > 0) {
    await prisma.notification.deleteMany({ where: { id: { in: staleNotifications } } });
  }
}

/** Throws if the run left anything behind. Call after the script's own cleanup. */
export async function assertNoResidue(label: string): Promise<void> {
  const residue = await collectResidue();
  if (!residue) return;
  throw new Error(
    `${label} left rows behind that its cleanup does not cover:\n${residue}\n` +
      `Delete these in the script's cleanup(), or extend the coverage.`
  );
}
