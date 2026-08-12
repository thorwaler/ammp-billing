/**
 * Elum 2026 org-tier feature flags.
 *
 * Mirror of `src/data/pricingData.ts` (`ELUM_TIER_FLAGS` / `ELUM_ECONF_FLAG`) —
 * Deno edge functions cannot import from `src/`, so the values are duplicated
 * here. Keep both in sync: renaming a flag requires editing both files.
 */

export const ELUM_TIER_FLAGS: Record<string, string> = {
  ci_lite: 'epm_lite',
  ci_pro: 'epm_pro',
  utility: 'epm_utility',
  internal: 'elum_internal',
};

/** Org-wide remote eConf add-on flag */
export const ELUM_ECONF_FLAG = 'remote_econf';

export interface ClassifiedOrg {
  orgId: string;
  orgName: string;
  uid?: number;
  tier: string | null;
  hasEconf: boolean;
}

/** Classify a raw AMMP `/orgs` row by its feature flags. */
export function classifyOrgRow(o: any): ClassifiedOrg {
  const flags = o.feature_flags || {};
  let tier: string | null = null;
  for (const [t, flag] of Object.entries(ELUM_TIER_FLAGS)) {
    if (flags[flag] === true && !tier) tier = t;
  }
  return {
    orgId: o.org_id,
    orgName: o.org_name || o.org_id,
    uid: o.uid,
    tier,
    hasEconf: flags[ELUM_ECONF_FLAG] === true,
  };
}
