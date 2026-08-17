import type { SupportDocumentData } from './supportDocumentGenerator';
import { isAssetIgnored } from './ignoredAssets';

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
const relevant = (assetId: any) => !isAssetIgnored(assetId);

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
