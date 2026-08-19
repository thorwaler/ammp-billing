import type { SupportDocumentData } from './supportDocumentGenerator';
import { isAssetIgnored } from './ignoredAssets';
import { batteryCapacityKWh, isBatteryOnlyAsset } from './batteryOnlyAssets';

export interface ZeroCapacitySection {
  /** Section heading the affected sites belong to */
  section: string;
  /** Capacity unit that is missing */
  unit: 'MWp' | 'kVA';
  /** true when the sites are still charged (at zero), false when excluded */
  billed: boolean;
  siteNames: string[];
}

const isZero = (v: number | null | undefined) => v == null || v <= 0;
/**
 * Ignored "zombie" sites and battery-only sites are never zero-capacity
 * warnings: the first is out of scope, the second has no PV by design.
 */
const relevant = (assetId: any) => !isAssetIgnored(assetId) && !isBatteryOnlyAsset(assetId);

/**
 * Collect every site in a support document with no usable capacity
 * (zero / missing PV MWp, or zero / missing genset kVA on Jubaili).
 *
 * Assets marked as ignored ("zombie" sites) are left out — they are shown in
 * the tables with an "ignored" label instead of a warning.
 */
export function collectZeroCapacitySections(data: SupportDocumentData): ZeroCapacitySection[] {
  const sections: ZeroCapacitySection[] = [];

  // Elum org-tier contracts (C&I Lite / Pro / Utility / Internal / Enterprise eConf)
  if (data.elumOrgTierBreakdown) {
    for (const org of data.elumOrgTierBreakdown.orgs) {
      const siteNames = org.sites
        .filter(s => isZero(s.mwp) && relevant(s.assetId))
        .map(s => s.assetName);
      if (siteNames.length > 0) {
        sections.push({ section: org.orgName, unit: 'MWp', billed: true, siteNames });
      }
    }
  }

  // Jubaili — genset rating
  if (data.elumJubailiBreakdown) {
    const siteNames = data.elumJubailiBreakdown.sites
      .filter((s: any) => isZero(s.kva) && relevant(s.assetId))
      .map((s: any) => s.assetName);
    if (siteNames.length > 0) {
      sections.push({
        section: 'Elum Jubaili (genset kVA bands)',
        unit: 'kVA',
        billed: false,
        siteNames,
      });
    }
  }

  // Generic per-asset monitoring table (ePM and other packages)
  if (data.assetBreakdown && data.assetBreakdown.length > 0) {
    const siteNames = data.assetBreakdown
      .filter((a: any) => isZero(a.pvCapacityKWp) && relevant(a.assetId))
      .map(a => a.assetName);
    if (siteNames.length > 0) {
      sections.push({ section: 'Asset breakdown', unit: 'MWp', billed: true, siteNames });
    }
  }

  return sections;
}


export function zeroCapacityTotal(sections: ZeroCapacitySection[]): number {
  return sections.reduce((n, s) => n + s.siteNames.length, 0);
}

/** Warning text for one section's affected sites. */
export function zeroCapacityMessage(section: ZeroCapacitySection): string {
  const unitLabel = section.unit === 'kVA' ? 'genset rating' : 'PV capacity';
  return `${section.siteNames.length} site(s) have no ${unitLabel} in AMMP and are ${
    section.billed ? 'billed at zero' : 'excluded from billing'
  } until the data is corrected: ${section.siteNames.join(', ')}`;
}

export type SiteCapacityStatus = 'ok' | 'ignored' | 'missing' | 'battery-only';

/**
 * Single source of truth for the per-site suffix shown next to an asset name
 * in support documents (screen and PDF) — ignored "zombie" sites, battery-only
 * sites, and sites with no usable capacity for the given unit.
 */
export function siteCapacityLabel(
  assetId: any,
  value: number | null | undefined,
  unit: 'MWp' | 'kVA' = 'MWp'
): { status: SiteCapacityStatus; suffix: string } {
  if (isAssetIgnored(assetId)) {
    return { status: 'ignored', suffix: ' — ignored (not relevant)' };
  }
  if (isBatteryOnlyAsset(assetId)) {
    const kwh = batteryCapacityKWh(assetId);
    return {
      status: 'battery-only',
      suffix: kwh != null
        ? ` — battery-only (${kwh.toFixed(0)} kWh, no PV inverter)`
        : ' — battery-only (no PV inverter)',
    };
  }
  if (isZero(value)) {
    return {
      status: 'missing',
      suffix: unit === 'kVA' ? ' — rating not set' : ' — capacity not set',
    };
  }
  return { status: 'ok', suffix: '' };
}

/** Battery-only sites in a support document, for a summary note. */
export function collectBatteryOnlySites(data: SupportDocumentData): string[] {
  const names = new Map<string, string>();
  const add = (assetId: any, assetName: string) => {
    if (isBatteryOnlyAsset(assetId)) names.set(String(assetId), assetName);
  };

  for (const org of data.elumOrgTierBreakdown?.orgs ?? []) {
    for (const s of org.sites) add(s.assetId, s.assetName);
  }
  for (const a of data.assetBreakdown ?? []) add((a as any).assetId, a.assetName);

  return [...names.values()];
}
