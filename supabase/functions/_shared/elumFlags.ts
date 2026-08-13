/**
 * Elum 2026 org-tier feature flags.
 *
 * Mirror of `src/data/pricingData.ts` (`ELUM_TIER_FLAGS` / `ELUM_ECONF_FLAG`) —
 * Deno edge functions cannot import from `src/`, so the values are duplicated
 * here. Keep both in sync: renaming a flag requires editing both files.
 */

/** Each tier may be marked by one of several flags. */
export const ELUM_TIER_FLAGS: Record<string, string[]> = {
  ci_lite: ['epm_lite'],
  ci_pro: ['epm_pro'],
  utility: ['epm_utility'],
  internal: ['elum_internal', 'epm_internal'],
};

/** Org-wide remote eConf add-on flag — never a tier conflict. */
export const ELUM_ECONF_FLAG = 'remote_econf';

/**
 * Orgs that must never be billed, whatever their feature flags say.
 * `84864a91-…` is Elum's virtual/internal-purpose assets org: it carries both
 * `epm_pro` and `epm_internal` but holds no billable customer assets.
 */
export const EXCLUDED_ORG_IDS: string[] = [
  '84864a91-bfb7-4504-9d3d-bb109ffc4fec',
];

export const isExcludedOrg = (orgId?: string | null): boolean =>
  !!orgId && EXCLUDED_ORG_IDS.includes(orgId);

export interface ClassifiedOrg {
  orgId: string;
  orgName: string;
  uid?: number;
  tier: string | null;
  hasEconf: boolean;
  /** Every billing tier whose flag is present on the org. */
  matchedTiers?: string[];
}

/**
 * Classify a raw AMMP `/orgs` row by its feature flags.
 * Internal always wins: an org flagged both `epm_pro` and `epm_internal`
 * is internal.
 */
export function classifyOrgRow(o: any): ClassifiedOrg {
  const flags = o.feature_flags || {};
  const matchedTiers: string[] = [];
  for (const [t, flagList] of Object.entries(ELUM_TIER_FLAGS)) {
    if (flagList.some((f) => flags[f] === true)) matchedTiers.push(t);
  }
  const tier = matchedTiers.includes('internal')
    ? 'internal'
    : (matchedTiers[0] ?? null);

  return {
    orgId: o.org_id,
    orgName: o.org_name || o.org_id,
    uid: o.uid,
    tier,
    hasEconf: flags[ELUM_ECONF_FLAG] === true,
    matchedTiers,
  };
}

/** True when an org carries 2+ non-internal tier flags (a real ambiguity). */
export function hasTierConflict(org: ClassifiedOrg): boolean {
  return (org.matchedTiers || []).filter((t) => t !== 'internal').length > 1;
}
