import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createNotifications } from "@/lib/notifications";
import { withCodeInTransaction } from "@/lib/representative-code";

/**
 * Representative applications.
 *
 * An applicant gets a real login immediately (role REPRESENTATIVE) but NO
 * Representative row. That distinction is what makes the two halves of the
 * programme work:
 *
 *   - The user can be emailed while an admin reviews them.
 *   - Nothing representative-specific is reachable, because both the middleware
 *     and `requireRepresentative` require the row, and the row only exists once
 *     an admin approves.
 *
 * Creating a full Representative on submission would instead hand every
 * applicant a working dashboard and a public referral code before any review.
 */

export class ApplicationValidationError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = "ApplicationValidationError";
  }
}

/** Sri Lankan mobile: 07XXXXXXXX / +947XXXXXXXX, tolerant of spaces and dashes. */
export function normalizeLocalPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return digits.slice(1);
  if (digits.length === 9 && digits.startsWith("7")) return digits;
  if (digits.length === 12 && digits.startsWith("94")) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith("94")) return digits.slice(2);
  return null;
}

export type SubmitApplicationInput = {
  fullName: string;
  email: string;
  phone: string;
  whatsapp?: string | null;
  password: string;
  nic?: string | null;
  dateOfBirth?: string | null;
  address?: string | null;
  district: string;
  province?: string | null;
  preferredArea?: string | null;
  coverageAreas?: string[];
  experience?: string | null;
  occupation?: string | null;
  socialProfileLink?: string | null;
  bankName?: string | null;
  bankAccountName?: string | null;
  bankAccountNumber?: string | null;
  bankBranch?: string | null;
  paymentMethodNotes?: string | null;
  agreedTerms: boolean;
  agreedCommission: boolean;
  agreedPrivacy: boolean;
  confirmedAccurate: boolean;
};

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function submitRepresentativeApplication(
  input: SubmitApplicationInput
): Promise<{ applicationId: string; applicationCode: string; userId: string }> {
  // Every agreement is required. A representative is being enrolled into a
  // money-splitting arrangement, so an application that skips the terms is
  // not a valid application.
  if (!input.agreedTerms || !input.agreedCommission || !input.agreedPrivacy || !input.confirmedAccurate) {
    throw new ApplicationValidationError(
      "agreements",
      "All four confirmations are required before an application can be submitted."
    );
  }

  const fullName = input.fullName.trim();
  if (fullName.length < 3) {
    throw new ApplicationValidationError("fullName", "Please enter your full name.");
  }

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    throw new ApplicationValidationError("email", "Please enter a valid email address.");
  }

  const phone = normalizeLocalPhone(input.phone);
  if (!phone) {
    throw new ApplicationValidationError("phone", "Please enter a valid mobile number.");
  }

  const whatsapp = input.whatsapp ? normalizeLocalPhone(input.whatsapp) : null;
  if (input.whatsapp && !whatsapp) {
    throw new ApplicationValidationError("whatsapp", "Please enter a valid WhatsApp number.");
  }

  if (input.password.length < 8) {
    throw new ApplicationValidationError("password", "Password must be at least 8 characters.");
  }

  if (!input.district?.trim()) {
    throw new ApplicationValidationError("district", "Please select your district.");
  }

  const dob = parseDate(input.dateOfBirth);
  if (input.dateOfBirth && !dob) {
    throw new ApplicationValidationError("dateOfBirth", "Please enter a valid date of birth.");
  }
  if (dob) {
    const age = (Date.now() - dob.getTime()) / (365.25 * 24 * 3600 * 1000);
    if (age < 18) {
      throw new ApplicationValidationError("dateOfBirth", "Applicants must be at least 18 years old.");
    }
  }

  // Checked before the transaction as a fast, friendly error, and again inside
  // it via the unique constraints so two simultaneous applications for the same
  // email cannot both get through.
  const clash = await prisma.user.findFirst({
    where: { OR: [{ email }, { phone }] },
    select: { email: true },
  });
  if (clash) {
    throw new ApplicationValidationError(
      "email",
      "An account with this email or mobile number already exists. Try signing in instead."
    );
  }

  const passwordHash = await hash(input.password, 12);
  const now = new Date();

  const result = await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        // Stored without the leading 0, matching the rest of the marketplace.
        phone,
        passwordHash,
        role: "REPRESENTATIVE",
        name: fullName,
      },
      select: { id: true },
    });

    // The public application code is allocated inside this same transaction, so
    // the count and the insert cannot disagree. It has no database default, so
    // it MUST come from the allocator.
    const application = await withCodeInTransaction(
      tx,
      "application",
      (tx2, code) =>
        tx2.representativeApplication.create({
          data: {
            applicationCode: code,
            userId: user.id,
            fullName,
            email,
            phone: phone ? `0${phone}` : "",
            whatsapp: whatsapp ? `0${whatsapp}` : null,
            nic: input.nic?.trim() || null,
            dateOfBirth: dob,
            address: input.address?.trim() || null,
            district: input.district.trim(),
            province: input.province?.trim() || null,
            preferredArea: input.preferredArea?.trim() || null,
            coverageAreas: JSON.stringify(input.coverageAreas ?? []),
            experience: input.experience?.trim() || null,
            occupation: input.occupation?.trim() || null,
            socialProfileLink: input.socialProfileLink?.trim() || null,
            bankName: input.bankName?.trim() || null,
            bankAccountName: input.bankAccountName?.trim() || null,
            bankAccountNumber: input.bankAccountNumber?.trim() || null,
            bankBranch: input.bankBranch?.trim() || null,
            paymentMethodNotes: input.paymentMethodNotes?.trim() || null,
            agreedTerms: true,
            agreedCommission: true,
            agreedPrivacy: true,
            confirmedAccurate: true,
            agreementsAt: now,
            status: "PENDING",
          },
          select: { id: true, applicationCode: true },
        })
    );

    return { user, application };
  }, { timeout: 15000, maxWait: 8000 });

  return {
    applicationId: result.application.id,
    applicationCode: result.application.applicationCode,
    userId: result.user.id,
  };
}

/**
 * Notifies admins that a new application is waiting.
 *
 * Best-effort and fanned out to current admins only; a failure here must not
 * roll back an application the applicant already submitted.
 */
export async function notifyAdminsOfApplication(applicationId: string, code: string): Promise<void> {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN" },
    select: { id: true },
    take: 25,
  });
  if (admins.length === 0) return;

  await createNotifications(
    admins.map((a) => ({
      userId: a.id,
      type: "APPLICATION_INFO_REQUESTED" as const,
      title: "New representative application",
      body: `Application ${code} is waiting for review.`,
      link: `/admin/representatives/applications/${applicationId}`,
      // Tagged with the application so it can be removed if the application is.
      // These are addressed to admins, not the applicant, so the cascade on User
      // never reaches them: deleting the applicant deleted the application and
      // left every admin holding a permanent unread alert about it.
      subjectType: "RepresentativeApplication",
      subjectId: applicationId,
    }))
  );
}
