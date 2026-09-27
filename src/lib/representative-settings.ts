import { prisma } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";

type Tx = import("@prisma/client").Prisma.TransactionClient;

/**
 * Financial + policy settings for the Producer Acquisition Representative
 * programme. Stored as a single row so the money figures have exactly one
 * home and are never duplicated across the codebase.
 *
 * Money is `Int` (whole rupees) rather than the `Float` used for order
 * totals elsewhere. Every figure here is a whole rupee and these values end
 * up in a financial ledger, where float drift is unacceptable.
 */

export const SETTINGS_ID = "singleton";

export const DEFAULT_SETTINGS = {
  producerAnnualRegistrationFee: 1200,
  representativeInitialCommission: 700,
  fortuneMarketInitialAllocation: 500,
  renewalCommissionEnabled: false,
  renewalCommissionAmount: 0,
  feeEnforcementMode: "FORCE_OPEN" as const,
  feeEnforcementStartsAt: null as Date | null,
  initialProducerTarget: null as number | null,
  currency: "LKR",
};

export type FeeEnforcementMode = "AUTO" | "FORCE_OPEN" | "FORCE_CLOSED";

export const FEE_ENFORCEMENT_MODES: FeeEnforcementMode[] = [
  "AUTO",
  "FORCE_OPEN",
  "FORCE_CLOSED",
];

export class SettingsValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SettingsValidationError";
  }
}

export type RepresentativeSettingsRecord = {
  id: string;
  producerAnnualRegistrationFee: number;
  representativeInitialCommission: number;
  fortuneMarketInitialAllocation: number;
  renewalCommissionEnabled: boolean;
  renewalCommissionAmount: number;
  feeEnforcementMode: string;
  feeEnforcementStartsAt: Date | null;
  initialProducerTarget: number | null;
  currency: string;
  updatedAt: Date;
  updatedById: string | null;
};

type SettingsShape = {
  producerAnnualRegistrationFee: number;
  representativeInitialCommission: number;
  fortuneMarketInitialAllocation: number;
  renewalCommissionEnabled: boolean;
  renewalCommissionAmount: number;
  feeEnforcementMode: string;
  feeEnforcementStartsAt: Date | null;
  initialProducerTarget: number | null;
};

/**
 * The financial split must always add up. This is enforced on read as well as
 * on write so a bad row can never silently produce a commission.
 */
export function assertValidSplit(s: {
  producerAnnualRegistrationFee: number;
  representativeInitialCommission: number;
  fortuneMarketInitialAllocation: number;
}): void {
  const { producerAnnualRegistrationFee: fee, representativeInitialCommission: commission, fortuneMarketInitialAllocation: allocation } = s;

  for (const [label, value] of [
    ["registration fee", fee],
    ["representative commission", commission],
    ["Fortune Market allocation", allocation],
  ] as const) {
    if (!Number.isInteger(value) || value < 0) {
      throw new SettingsValidationError(
        `The ${label} must be a whole number of rupees (0 or more).`
      );
    }
  }

  if (fee !== commission + allocation) {
    throw new SettingsValidationError(
      `The financial split does not add up: fee (Rs. ${fee}) must equal representative commission (Rs. ${commission}) plus Fortune Market allocation (Rs. ${allocation}), which is Rs. ${commission + allocation}.`
    );
  }
}

export function assertValidSettings(s: SettingsShape): void {
  assertValidSplit(s);

  if (!FEE_ENFORCEMENT_MODES.includes(s.feeEnforcementMode as FeeEnforcementMode)) {
    throw new SettingsValidationError(
      `Unknown fee enforcement mode "${s.feeEnforcementMode}".`
    );
  }

  if (
    s.initialProducerTarget !== null &&
    (!Number.isInteger(s.initialProducerTarget) || s.initialProducerTarget < 0)
  ) {
    throw new SettingsValidationError(
      "The initial producer target must be a whole number of producers, or empty."
    );
  }

  if (s.renewalCommissionEnabled) {
    if (!Number.isInteger(s.renewalCommissionAmount) || s.renewalCommissionAmount < 0) {
      throw new SettingsValidationError(
        "The renewal commission amount must be a whole number of rupees when renewal commission is enabled."
      );
    }
    if (s.renewalCommissionAmount > 0) {
      const allocation = s.producerAnnualRegistrationFee - s.renewalCommissionAmount;
      if (allocation < 0) {
        throw new SettingsValidationError(
          `A renewal commission of Rs. ${s.renewalCommissionAmount} exceeds the annual registration fee of Rs. ${s.producerAnnualRegistrationFee}.`
        );
      }
    }
  } else if (s.renewalCommissionAmount !== 0) {
    throw new SettingsValidationError(
      "Renewal commission is disabled, so the renewal commission amount must be 0."
    );
  }
}

/**
 * Reads the singleton row, creating it with defaults on first access.
 *
 * Pass a transaction client to read the settings inside a transaction that is
 * about to freeze a fee decision onto a payment row. That matters: if an admin
 * flips the gate between the read and the commit, a producer could be charged
 * against a rule that no longer applies, or escape a rule that now does.
 */
export async function getSettings(
  client: Tx | typeof prisma = prisma
): Promise<RepresentativeSettingsRecord> {
  const existing = await client.representativeSettings.findUnique({
    where: { id: SETTINGS_ID },
  });
  if (existing) {
    assertValidSplit(existing);
    return existing;
  }

  return client.representativeSettings.create({
    data: { id: SETTINGS_ID, ...DEFAULT_SETTINGS },
  });
}

/**
 * Whether the registration fee is currently enforced for producers who were
 * NOT introduced by a representative.
 *
 * AUTO follows the closing date. FORCE_OPEN / FORCE_CLOSED override the date
 * in either direction, so an admin can close the gate immediately or hold it
 * open past the scheduled date.
 */
export function isFeeEnforced(
  settings: Pick<
    RepresentativeSettingsRecord,
    "feeEnforcementMode" | "feeEnforcementStartsAt"
  >,
  now: Date = new Date()
): boolean {
  switch (settings.feeEnforcementMode) {
    case "FORCE_CLOSED":
      return true;
    case "FORCE_OPEN":
      return false;
    case "AUTO":
    default:
      return (
        settings.feeEnforcementStartsAt !== null &&
        settings.feeEnforcementStartsAt.getTime() <= now.getTime()
      );
  }
}

/**
 * The single decision point for whether a producer owes the registration fee.
 *
 * A producer introduced by a representative ALWAYS pays — that is the whole
 * commercial model, and it is deliberately independent of the gate. A producer
 * with no representative referral is only charged once the gate is closed,
 * which is how the initial producer cohort is seeded for free.
 *
 * Call this ONCE at registration and freeze the answer onto the payment row
 * (see `ProducerRegistrationPayment.feeRequired`). Never re-evaluate it at
 * approval time: a producer who registered one minute before the closing date
 * must keep that price regardless of when an admin gets to them.
 */
export function isFeeRequired(
  input: { hasLockedReferral: boolean },
  settings: Pick<
    RepresentativeSettingsRecord,
    "feeEnforcementMode" | "feeEnforcementStartsAt"
  >,
  now: Date = new Date()
): { required: boolean; basis: "REFERRAL" | "GATE_ENFORCED" | null } {
  if (input.hasLockedReferral) {
    return { required: true, basis: "REFERRAL" };
  }
  if (isFeeEnforced(settings, now)) {
    return { required: true, basis: "GATE_ENFORCED" };
  }
  return { required: false, basis: null };
}

export type SettingsUpdate = Partial<SettingsShape>;

/**
 * Applies a settings change: validates the full resulting row, writes an
 * append-only revision, and records an audit entry. Existing commission and
 * payment amounts are snapshots and are therefore never touched.
 */
export async function updateSettings(
  patch: SettingsUpdate,
  actor: { id: string; role: string },
  reason: string
): Promise<RepresentativeSettingsRecord> {
  if (!reason || !reason.trim()) {
    throw new SettingsValidationError("A reason is required for every settings change.");
  }

  const current = await getSettings();
  const next: SettingsShape = {
    producerAnnualRegistrationFee:
      patch.producerAnnualRegistrationFee ?? current.producerAnnualRegistrationFee,
    representativeInitialCommission:
      patch.representativeInitialCommission ?? current.representativeInitialCommission,
    fortuneMarketInitialAllocation:
      patch.fortuneMarketInitialAllocation ?? current.fortuneMarketInitialAllocation,
    renewalCommissionEnabled:
      patch.renewalCommissionEnabled ?? current.renewalCommissionEnabled,
    renewalCommissionAmount:
      patch.renewalCommissionAmount ?? current.renewalCommissionAmount,
    feeEnforcementMode: patch.feeEnforcementMode ?? current.feeEnforcementMode,
    feeEnforcementStartsAt:
      patch.feeEnforcementStartsAt !== undefined
        ? patch.feeEnforcementStartsAt
        : current.feeEnforcementStartsAt,
    initialProducerTarget:
      patch.initialProducerTarget !== undefined
        ? patch.initialProducerTarget
        : current.initialProducerTarget,
  };

  assertValidSettings(next);

  if (patch.renewalCommissionEnabled === true && !current.renewalCommissionEnabled) {
    throw new SettingsValidationError(
      "Year-2 renewal commission is a policy decision that must be confirmed in the admin panel before it can be enabled."
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    const row = await tx.representativeSettings.update({
      where: { id: SETTINGS_ID },
      data: {
        ...next,
        feeEnforcementStartsAt: next.feeEnforcementStartsAt,
        initialProducerTarget: next.initialProducerTarget,
        updatedById: actor.id,
      },
    });

    await tx.representativeSettingsRevision.create({
      data: {
        settingsId: SETTINGS_ID,
        producerAnnualRegistrationFee: row.producerAnnualRegistrationFee,
        representativeInitialCommission: row.representativeInitialCommission,
        fortuneMarketInitialAllocation: row.fortuneMarketInitialAllocation,
        renewalCommissionEnabled: row.renewalCommissionEnabled,
        renewalCommissionAmount: row.renewalCommissionAmount,
        feeEnforcementMode: row.feeEnforcementMode,
        feeEnforcementStartsAt: row.feeEnforcementStartsAt,
        initialProducerTarget: row.initialProducerTarget,
        reason: reason.trim(),
        changedById: actor.id,
      },
    });

    return row;
    // Explicit timeout: this runs against a pooled, serverless Postgres where a
    // cold connection can spend several seconds just being established. Prisma's
    // 5s default would abort the commit and leave the admin thinking the change
    // saved when it did not.
  }, { timeout: 15000, maxWait: 8000 });

  await recordAudit({
    actor,
    action: "REPRESENTATIVE_SETTINGS_UPDATED",
    entityType: "RepresentativeSettings",
    entityId: SETTINGS_ID,
    previousValue: JSON.stringify({
      producerAnnualRegistrationFee: current.producerAnnualRegistrationFee,
      representativeInitialCommission: current.representativeInitialCommission,
      fortuneMarketInitialAllocation: current.fortuneMarketInitialAllocation,
      feeEnforcementMode: current.feeEnforcementMode,
      feeEnforcementStartsAt: current.feeEnforcementStartsAt?.toISOString() ?? null,
    }),
    newValue: JSON.stringify({
      producerAnnualRegistrationFee: updated.producerAnnualRegistrationFee,
      representativeInitialCommission: updated.representativeInitialCommission,
      fortuneMarketInitialAllocation: updated.fortuneMarketInitialAllocation,
      feeEnforcementMode: updated.feeEnforcementMode,
      feeEnforcementStartsAt: updated.feeEnforcementStartsAt?.toISOString() ?? null,
    }),
    metadata: { reason: reason.trim() },
  });

  return updated;
}

/**
 * Progress against the (informational, never enforced) initial producer target.
 */
export async function getProducerSeedingProgress() {
  const settings = await getSettings();
  const freeProducerCount = await prisma.producerRegistrationPayment.count({
    where: { status: "WAIVED" },
  });

  return {
    freeProducerCount,
    target: settings.initialProducerTarget,
    feeEnforced: isFeeEnforced(settings),
    enforcementMode: settings.feeEnforcementMode,
    enforcementStartsAt: settings.feeEnforcementStartsAt,
  };
}
