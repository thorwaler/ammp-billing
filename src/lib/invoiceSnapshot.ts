/**
 * Invoice input snapshots.
 *
 * Every new invoice writes a full snapshot of the inputs used to compute it
 * (resolved asset list, per-asset MW/capabilities, contract rates at
 * generation time, exchange rate, zero-PV substitutions, period bounds). We
 * store `snapshot_frozen_at` and a 30-day `revision_deadline` so an operator
 * can redo an invoice deterministically if source data (typically zero-PV
 * assets) gets corrected within that window.
 */

export const REVISION_WINDOW_DAYS = 30;

export interface InvoiceInputSnapshot {
  version: 1;
  contractId: string;
  customerId: string;
  invoiceDate: string; // ISO
  periodStart?: string | null;
  periodEnd?: string | null;
  currency: string;
  exchangeRateEUR?: number | null;

  // Contract rate configuration at freeze time — full JSON blob.
  contract: Record<string, unknown>;

  // Resolved asset list at freeze time (from cached_capabilities.assets
  // after zero-PV substitutions).
  assets: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    isEstimated?: boolean;
    estimatedFromMW?: number;
    estimateSource?: string;
    incidentId?: string;
  }>;

  // Zero-PV incidents referenced by this invoice (for reversal on delete
  // or revision).
  zeroPvIncidentIds: string[];

  // The final line items / totals actually stored on the invoice — kept for
  // audit and diff on revision.
  totals: {
    invoiceAmount: number;
    arrAmount?: number;
    nrrAmount?: number;
  };
}

export interface SnapshotFields {
  input_snapshot: InvoiceInputSnapshot;
  snapshot_frozen_at: string;
  revision_deadline: string;
}

export function buildSnapshot(snap: InvoiceInputSnapshot): SnapshotFields {
  const now = new Date();
  const deadline = new Date(now.getTime() + REVISION_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return {
    input_snapshot: snap,
    snapshot_frozen_at: now.toISOString(),
    revision_deadline: deadline.toISOString(),
  };
}

export function isWithinRevisionWindow(
  revisionDeadline: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!revisionDeadline) return false;
  return new Date(revisionDeadline).getTime() > now.getTime();
}

export function daysUntilRevisionDeadline(
  revisionDeadline: string | null | undefined,
  now: Date = new Date()
): number | null {
  if (!revisionDeadline) return null;
  const ms = new Date(revisionDeadline).getTime() - now.getTime();
  return Math.ceil(ms / (24 * 60 * 60 * 1000));
}
