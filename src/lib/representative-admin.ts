import { prisma } from "@/lib/prisma";
import { withCodeInTransaction } from "@/lib/representative-code";
import { createNotification } from "@/lib/notifications";
import { recordAudit, type AuditActor } from "@/lib/audit";

/**
 * Admin decisions on representative applications.
 *
 * Approval is the moment the two halves of the programme join: the applicant
 * already has a login (role REPRESENTATIVE) from submitting, and approval adds
 * the Representative row, the public code, and the working relationship. Until
 * that row exists the applicant can sign in but can reach nothing, which is why
 * the same `Representative` role is not sufficient authorisation anywhere.
 *
 * Approval is idempotent: an already-approved application returns the existing
 * representative rather than minting a second public code. An admin clicking
 * approve twice must not create two representatives and two commission ledgers.
 */

export type AdminActor = AuditActor;

export class ApplicationStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ApplicationStateError";
  }
}

export async function getApplication(applicationId: string) {
  return prisma.representativeApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      applicationCode: true,
      status: true,
      fullName: true,
      email: true,
      phone: true,
      district: true,
      userId: true,
      representativeId: true,
      reviewNotes: true,
    },
  });
}

export async function approveApplication(
  applicationId: string,
  admin: AdminActor
): Promise<{ representativeId: string; code: string; alreadyApproved: boolean }> {
  const application = await prisma.representativeApplication.findUnique({
    where: { id: applicationId },
    select: {
      id: true,
      status: true,
      fullName: true,
      email: true,
      phone: true,
      whatsapp: true,
      nic: true,
      district: true,
      province: true,
      address: true,
      preferredArea: true,
      coverageAreas: true,
      experience: true,
      occupation: true,
      socialProfileLink: true,
      bankName: true,
      bankAccountName: true,
      bankAccountNumber: true,
      bankBranch: true,
      paymentMethodNotes: true,
      userId: true,
      representativeId: true,
    },
  });

  if (!application) {
    throw new ApplicationStateError("That application does not exist.");
  }

  // Idempotent: return the representative that already exists.
  if (application.representativeId) {
    const existing = await prisma.representative.findUnique({
      where: { id: application.representativeId },
      select: { id: true, code: true },
    });
    if (existing) {
      return { representativeId: existing.id, code: existing.code, alreadyApproved: true };
    }
  }

  if (application.status === "REJECTED") {
    throw new ApplicationStateError(
      "This application was already rejected and cannot be approved. Ask the applicant to apply again."
    );
  }

  if (application.status === "SUSPENDED" || application.status === "INACTIVE") {
    throw new ApplicationStateError(
      "This representative's account is closed. Reinstate it before approving anything further."
    );
  }

  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const representative = await withCodeInTransaction(tx, "representative", (tx2, code) =>
      tx2.representative.create({
        data: {
          code,
          userId: application.userId,
          fullName: application.fullName,
          nic: application.nic,
          phone: application.phone,
          whatsapp: application.whatsapp,
          email: application.email,
          address: application.address,
          district: application.district,
          province: application.province,
          preferredArea: application.preferredArea,
          coverageAreas: application.coverageAreas,
          experience: application.experience,
          occupation: application.occupation,
          socialProfileLink: application.socialProfileLink,
          bankName: application.bankName,
          bankAccountName: application.bankAccountName,
          bankAccountNumber: application.bankAccountNumber,
          bankBranch: application.bankBranch,
          paymentMethodNotes: application.paymentMethodNotes,
          status: "ACTIVE",
          joinedAt: now,
          approvedAt: now,
          approvedById: admin.id ?? null,
        },
        select: { id: true, code: true },
      })
    );

    await tx.representativeApplication.update({
      where: { id: application.id },
      data: {
        status: "APPROVED",
        representativeId: representative.id,
        reviewedAt: now,
        reviewedById: admin.id ?? null,
        // Cleared so a stale "we need more information" note does not keep
        // showing next to an approved representative.
        infoRequestNote: null,
      },
    });

    return representative;
  }, { timeout: 15000, maxWait: 8000 });

  await Promise.allSettled([
    createNotification({
      userId: application.userId,
      type: "APPLICATION_APPROVED",
      subjectType: "RepresentativeApplication",
      subjectId: application.id,
      title: "Your representative application was approved",
      body: `Your representative code is ${result.code}. Producers who register through your link will count towards your commission.`,
      link: "/representative",
    }),
    recordAudit({
      actor: admin,
      action: "REPRESENTATIVE_APPLICATION_APPROVED",
      entityType: "Representative",
      entityId: result.id,
      representativeId: result.id,
      newValue: { applicationId, code: result.code },
    }),
  ]);

  return { representativeId: result.id, code: result.code, alreadyApproved: false };
}

export async function rejectApplication(
  applicationId: string,
  admin: AdminActor,
  reason: string
): Promise<void> {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    throw new ApplicationStateError(
      "A rejection reason is required so the applicant knows what to fix."
    );
  }

  const application = await prisma.representativeApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, userId: true, representativeId: true },
  });
  if (!application) {
    throw new ApplicationStateError("That application does not exist.");
  }
  if (application.representativeId) {
    throw new ApplicationStateError(
      "This application has already been approved. Suspend or deactivate the representative instead of rejecting the application."
    );
  }

  const now = new Date();
  await prisma.representativeApplication.update({
    where: { id: application.id },
    data: {
      status: "REJECTED",
      reviewNotes: trimmed,
      reviewedAt: now,
      reviewedById: admin.id ?? null,
    },
  });

  await Promise.allSettled([
    createNotification({
      userId: application.userId,
      type: "APPLICATION_REJECTED",
      subjectType: "RepresentativeApplication",
      subjectId: application.id,
      title: "Your representative application was not approved",
      body: trimmed,
      link: "/representative/apply",
    }),
    recordAudit({
      actor: admin,
      action: "REPRESENTATIVE_APPLICATION_REJECTED",
      entityType: "RepresentativeApplication",
      entityId: application.id,
      newValue: { reason: trimmed },
    }),
  ]);
}

export async function requestApplicationInfo(
  applicationId: string,
  admin: AdminActor,
  note: string
): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length < 5) {
    throw new ApplicationStateError("Please say what information you need.");
  }

  const application = await prisma.representativeApplication.findUnique({
    where: { id: applicationId },
    select: { id: true, status: true, userId: true, representativeId: true },
  });
  if (!application) {
    throw new ApplicationStateError("That application does not exist.");
  }
  if (application.representativeId) {
    throw new ApplicationStateError(
      "This application has already been decided, so no further information is needed."
    );
  }

  await prisma.representativeApplication.update({
    where: { id: application.id },
    data: {
      status: "UNDER_REVIEW",
      infoRequestNote: trimmed,
      infoRequestedAt: new Date(),
    },
  });

  await Promise.allSettled([
    createNotification({
      userId: application.userId,
      type: "APPLICATION_INFO_REQUESTED",
      subjectType: "RepresentativeApplication",
      subjectId: application.id,
      title: "We need more information about your application",
      body: trimmed,
      link: "/representative/apply",
    }),
    recordAudit({
      actor: admin,
      action: "REPRESENTATIVE_APPLICATION_INFO_REQUESTED",
      entityType: "RepresentativeApplication",
      entityId: application.id,
      newValue: { note: trimmed },
    }),
  ]);
}
