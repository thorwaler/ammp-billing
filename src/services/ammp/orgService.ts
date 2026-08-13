/**
 * AMMP organisation discovery for the Elum 2026 org-based tiers.
 *
 * Tiers are managed at the Organisation level. Sub-orgs under the Elum parent
 * org carry feature flags that determine which tier they belong to:
 *   epm_lite  -> C&I Lite
 *   epm_pro   -> C&I Pro
 *   epm_utility -> Utility
 *   elum_internal -> Internal
 *   remote_econf -> org-wide remote eConf add-on (billable on Lite and Internal)
 *
 * Enterprise orgs keep their own dedicated contracts and are not discovered here.
 */

import { dataApiClient } from "./dataApiClient";
import type { OrgResponse } from "@/types/ammp-api";
import {
  ELUM_ECONF_FLAG,
  ELUM_TIER_FLAGS,
  ELUM_EXCLUDED_ORG_IDS,
  type ElumOrgTier,
} from "@/data/pricingData";

export interface ClassifiedOrg {
  orgId: string;
  uid?: number;
  orgName: string;
  parentOrgId?: string | null;
  tier: ElumOrgTier | null;
  hasEconf: boolean;
  /** Every billing tier whose flag is present on the org. */
  matchedTiers: ElumOrgTier[];
  flags: Record<string, unknown>;
}

export function classifyOrg(org: OrgResponse): ClassifiedOrg {
  const flags = (org.feature_flags || {}) as Record<string, unknown>;
  const matchedTiers = (Object.keys(ELUM_TIER_FLAGS) as ElumOrgTier[]).filter((t) =>
    ELUM_TIER_FLAGS[t].some((f) => flags[f] === true)
  );
  // Internal always wins over any other tier flag.
  const tier: ElumOrgTier | null = matchedTiers.includes("internal")
    ? "internal"
    : (matchedTiers[0] ?? null);

  return {
    orgId: org.org_id,
    uid: org.uid,
    orgName: org.org_name,
    parentOrgId: org.parent_org_id ?? null,
    tier,
    hasEconf: flags[ELUM_ECONF_FLAG] === true,
    matchedTiers,
    flags,
  };
}

/** True when an org carries 2+ non-internal tier flags (a real ambiguity). */
export function hasTierConflict(org: ClassifiedOrg): boolean {
  return org.matchedTiers.filter((t) => t !== "internal").length > 1;
}

/**
 * Fetch and classify all sub-orgs of a parent org.
 * `excludeOrgIds` removes orgs handled by their own contracts (Internal, Enterprise).
 * Globally excluded orgs (Elum virtual assets) are always dropped.
 */
export async function getClassifiedSubOrgs(
  parentOrgId: string,
  excludeOrgIds: string[] = []
): Promise<ClassifiedOrg[]> {
  const orgs = await dataApiClient.listOrgs(parentOrgId);
  const excluded = new Set([...excludeOrgIds.filter(Boolean), ...ELUM_EXCLUDED_ORG_IDS]);
  return orgs
    .filter((o) => o.org_id !== parentOrgId && !excluded.has(o.org_id))
    .map(classifyOrg);
}

/** Sub-orgs belonging to a given tier. */
export function orgsForTier(orgs: ClassifiedOrg[], tier: ElumOrgTier): ClassifiedOrg[] {
  return orgs.filter((o) => o.tier === tier);
}

/** Sub-orgs with no tier flag set — excluded from pricing, surfaced as a warning. */
export function unassignedOrgs(orgs: ClassifiedOrg[]): ClassifiedOrg[] {
  return orgs.filter((o) => o.tier === null);
}
