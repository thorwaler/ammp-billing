// Asset group filtering utility for multi-group boolean logic
// Formula: (Assets in Primary Group) ∩ (Assets in AND Group) - (Assets in NOT Group)

import { dataApiClient } from "@/services/ammp/dataApiClient";

interface AssetBreakdownItem {
  assetId: string;
  assetName: string;
  totalMW: number;
  isHybrid?: boolean;
  capacityKWp?: number;
  hasSolcast?: boolean;
  onboardingDate?: string;
}

/**
 * Filter assets using multi-group boolean logic
 * @param customerAssetBreakdown - Full asset breakdown from customer's AMMP capabilities
 * @param primaryGroupId - Required: Assets must be in this group
 * @param andGroupId - Optional: Assets must ALSO be in this group
 * @param notGroupId - Optional: Assets must NOT be in this group
 * @returns Filtered array of assets matching the criteria
 */
export async function filterAssetsByGroups(
  customerAssetBreakdown: AssetBreakdownItem[],
  primaryGroupId: string,
  andGroupId?: string | null,
  notGroupId?: string | null
): Promise<AssetBreakdownItem[]> {
  if (!primaryGroupId || customerAssetBreakdown.length === 0) {
    return customerAssetBreakdown;
  }

  try {
    // Fetch members from each group in parallel
    const [primaryMembers, andMembers, notMembers] = await Promise.all([
      dataApiClient.getAssetGroupMembers(primaryGroupId),
      andGroupId ? dataApiClient.getAssetGroupMembers(andGroupId) : Promise.resolve(null),
      notGroupId ? dataApiClient.getAssetGroupMembers(notGroupId) : Promise.resolve(null),
    ]);

    // Create sets for O(1) lookup
    const primarySet = new Set(primaryMembers.map(m => m.asset_id));
    const andSet = andMembers ? new Set(andMembers.map(m => m.asset_id)) : null;
    const notSet = notMembers ? new Set(notMembers.map(m => m.asset_id)) : null;

    return customerAssetBreakdown.filter(asset => {
      // Must be in primary group
      if (!primarySet.has(asset.assetId)) return false;

      // If AND group specified, must also be in it
      if (andSet && !andSet.has(asset.assetId)) return false;

      // If NOT group specified, must NOT be in it
      if (notSet && notSet.has(asset.assetId)) return false;

      return true;
    });
  } catch (error) {
    console.error("Error filtering assets by groups:", error);
    // On error, return empty to avoid billing wrong assets
    return [];
  }
}

/**
 * Check if asset group filtering is configured for a contract
 */
export function hasAssetGroupFiltering(contract: {
  ammp_asset_group_id?: string | null;
  ammp_asset_group_id_and?: string | null;
  ammp_asset_group_id_not?: string | null;
}): boolean {
  return !!(contract.ammp_asset_group_id || contract.ammp_asset_group_id_and || contract.ammp_asset_group_id_not);
}
