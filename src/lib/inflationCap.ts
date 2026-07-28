/**
 * Inflation cap helpers.
 *
 * Existing-site price increases are capped at the 6-month rolling average of
 * the ECB HICP index. Rates are cached monthly in `inflation_reference_rates`
 * by the `fetch-ecb-inflation` edge function.
 */
import { supabase } from "@/integrations/supabase/client";

export interface InflationRateRow {
  month: string;
  source: string;
  rate_pct: number;
}

/**
 * Rolling 6-month average of ECB HICP annualized rate.
 */
export async function getSixMonthAverageRate(): Promise<number | null> {
  const { data, error } = await supabase
    .from("inflation_reference_rates" as any)
    .select("rate_pct, month")
    .eq("source", "ecb_hicp")
    .order("month", { ascending: false })
    .limit(6);
  if (error || !data || data.length === 0) return null;
  const rows = data as unknown as InflationRateRow[];
  const sum = rows.reduce((acc, r) => acc + Number(r.rate_pct), 0);
  return Math.round((sum / rows.length) * 100) / 100;
}

/**
 * Anniversary date closest to `today` for a given contract signed date.
 * Returns the next anniversary strictly after today.
 */
export function nextAnniversary(signedDate: string, today: Date = new Date()): Date {
  const signed = new Date(signedDate);
  const anniv = new Date(today.getFullYear(), signed.getMonth(), signed.getDate());
  if (anniv.getTime() <= today.getTime()) {
    anniv.setFullYear(anniv.getFullYear() + 1);
  }
  return anniv;
}

/**
 * True when today falls on the notice threshold (anniversary − noticeDays)
 * and no notice has been sent in the current cycle.
 */
export function shouldSendAnniversaryNotice(
  signedDate: string,
  noticeDays: number,
  lastSentAt: string | null,
  today: Date = new Date()
): boolean {
  const anniv = nextAnniversary(signedDate, today);
  const noticeDate = new Date(anniv);
  noticeDate.setDate(noticeDate.getDate() - noticeDays);
  const isToday =
    noticeDate.getFullYear() === today.getFullYear() &&
    noticeDate.getMonth() === today.getMonth() &&
    noticeDate.getDate() === today.getDate();
  if (!isToday) return false;
  if (!lastSentAt) return true;
  const last = new Date(lastSentAt);
  // Only one notice per anniversary cycle.
  const cycleStart = new Date(anniv);
  cycleStart.setFullYear(cycleStart.getFullYear() - 1);
  return last.getTime() < cycleStart.getTime();
}
