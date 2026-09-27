const LABELS: Record<string, string> = {
  ELIGIBLE: "Pending approval",
  APPROVED: "Awaiting payout",
  PAYABLE: "In a payout",
  PAID: "Paid",
  CANCELLED: "Cancelled",
};

/**
 * Commission status, as shown to a representative.
 *
 * A flagged commission says so first, because that is the state the rep
 * actually needs to act on — a held payment is not the same as a pending one,
 * and showing it as merely "awaiting payout" would hide the reason their money
 * has stopped moving.
 */
export function CommissionBadge({
  status,
  flagged,
}: {
  status: string;
  flagged?: boolean | null;
}) {
  if (flagged) return <span className="badge-rejected mt-1">Flagged for review</span>;
  if (status === "PAID") return <span className="badge-verified mt-1">Paid</span>;
  if (status === "CANCELLED") return <span className="badge-rejected mt-1">Cancelled</span>;
  return <span className="badge-pending mt-1">{LABELS[status] ?? status}</span>;
}
