import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runZeroPvScan } from '../_shared/zeroPvScan.ts';
import { postJsonWithRetry as sharedPostJsonWithRetry, parseRetryAfterMs } from '../_shared/internalFetch.ts';
import { fetchAmmpData, fetchOrgAssets } from '../_shared/ammpClient.ts';
import { classifyOrgRow, hasTierConflict, isExcludedOrg, type ClassifiedOrg } from '../_shared/elumFlags.ts';

// Declare EdgeRuntime for Supabase Edge Functions (auto-continuation support)
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void;
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

import type { DeviceInfo, CachedAssetBreakdown } from '../_shared/ammpTypes.ts';

interface AssetCapabilities {
  assetId: string;
  assetName: string;
  totalMW: number;
  capacityKWp: number;
  /** Genset rating in kVA (AMMP `genset_capacity` is in VA) */
  gensetKVA: number | null;
  hasSolcast: boolean;
  hasBattery: boolean;
  hasGenset: boolean;
  hasHybridEMS: boolean;
  hasHybridMeter: boolean;
  onboardingDate?: string | null;
  solcastOnboardingDate?: string | null; // Date when satellite/solcast device was created
  deviceCount: number;
  devices: DeviceInfo[];
}

/** Flag-less sub-org plus how its assets fare against the legacy asset group */
interface UnassignedOrgEntry {
  orgId: string;
  orgName: string;
  assetCount?: number;
  totalMW?: number;
  coveredStandard?: number;
  coveredEconf?: number;
  /** Only set when the contract still has a NOT (exclusion) asset group configured */
  excluded?: number;
  uncovered?: number;
  uncoveredMW?: number;
  uncoveredAssets?: Array<{ assetId: string; assetName: string; mw: number }>;
  /** Assets billed through another Elum tier contract's legacy asset group */
  coveredElsewhere?: number;
  coveredElsewhereAssets?: Array<{ assetId: string; assetName: string; tierName: string }>;
  /** Coverage not verified because the sync ran out of its time budget */
  partial?: boolean;
  /** Coverage verified, but a sibling tier's asset group could not be read (e.g. deleted in AMMP) */
  siblingIncomplete?: boolean;
  /** How the asset list for this org was resolved */
  source?: 'org-scoped' | 'unresolved';

  /** Never-configured stub assets in AMMP catch-all orgs; excluded from counts. */
  placeholders?: number;
}



interface CachedCapabilities {

  totalMW: number;
  totalSites: number;
  ongridMW: number;
  hybridMW: number;
  ongridSites: number;
  hybridSites: number;
  sitesWithSolcast: number;
  assetBreakdown: CachedAssetBreakdown[];
  lastSynced: string;
  /** Elum 2026: per-sub-organisation grouping of the resolved assets */
  orgBreakdown?: Array<{
    orgId: string;
    orgName: string;
    uid?: number;
    tier?: string | null;
    hasEconf?: boolean;
    isLegacyAssetGroup?: boolean;
    assets: Array<{ assetId: string; assetName: string; totalMW: number }>;
  }>;
  /** Assets resolved from both an org and a legacy asset group (counted once) */
  doubleCountWarnings?: Array<{ assetId: string; assetName: string; orgName: string }>;
  /** Sub-orgs under the parent org with no tier flag set (with their impact) */
  unassignedOrgs?: UnassignedOrgEntry[];
  /** Sub-orgs carrying 2+ conflicting billing tier flags (internal excluded — internal always wins) */
  tierConflictOrgs?: Array<{ orgId: string; orgName: string; tiers: string[] }>;
  /** Orgs skipped entirely during discovery because they are never billable */
  excludedOrgs?: Array<{ orgId: string; orgName: string }>;


  /** Per-org audit trail of how each org's assets were resolved during the last sync */
  orgResolution?: Array<{ orgId: string; orgName: string; assetCount: number; source: string }>;
  needsDeviceEnrichment?: boolean;
  lastDeviceEnrichment?: string;
  deviceEnrichmentProgress?: {
    processed: number;
    total: number;
  };
}

interface SyncResult {
  cachedCapabilities: CachedCapabilities;
  syncStatus: 'synced' | 'partial';
  timedOut: boolean;
  totalExpected: number;
  previouslySynced: number;
  newlySynced: number;
  previousSyncStatus: 'synced' | 'partial' | null;
}

/**
 * Convert stored asset breakdown format back to AssetCapabilities
 */
function convertStoredToCapabilities(stored: CachedCapabilities['assetBreakdown'][0]): AssetCapabilities {
  return {
    assetId: stored.assetId,
    assetName: stored.assetName,
    totalMW: stored.totalMW,
    capacityKWp: stored.capacityKWp,
    gensetKVA: stored.gensetKVA ?? null,
    hasSolcast: stored.hasSolcast,
    hasBattery: stored.isHybrid, // Stored as isHybrid
    hasGenset: false,
    hasHybridEMS: false,
    hasHybridMeter: false,
    onboardingDate: stored.onboardingDate,
    solcastOnboardingDate: stored.solcastOnboardingDate,
    deviceCount: stored.deviceCount,
    devices: stored.devices || [],
  };
}

/**
 * Call existing ammp-token-exchange Edge Function internally
 */
async function getToken(apiKey: string): Promise<string> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const data = await postJsonWithRetry(
    `${supabaseUrl}/functions/v1/ammp-token-exchange`,
    serviceKey,
    { apiKey },
    'Token exchange'
  );
  return data.access_token;
}

/**
 * `postJsonWithRetry` / `parseRetryAfterMs` / `isRateLimited` live in
 * `../_shared/internalFetch.ts` — they are shared with ammp-device-enrichment.
 * The local wrapper only pins the log prefix for this function.
 */
function postJsonWithRetry(
  url: string,
  serviceKey: string,
  body: unknown,
  label: string,
  maxAttempts = 5,
): Promise<any> {
  return sharedPostJsonWithRetry(url, serviceKey, body, label, maxAttempts, 'ammp-sync-contract');
}





/**
 * Validate caller and resolve the effective team member running the sync.
 * Browser calls must provide a valid user JWT. Internal continuations may use
 * the service role key, but must still pass the original userId.
 */
async function resolveAuthorizedUser(
  req: Request,
  supabase: any,
  serviceKey: string,
  requestedUserId?: string,
): Promise<{ effectiveUserId: string; isServiceRoleRequest: boolean }> {
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ')
    ? authHeader.replace('Bearer ', '')
    : null;
  const isServiceRoleRequest = bearerToken === serviceKey;

  let effectiveUserId = requestedUserId;

  if (!isServiceRoleRequest) {
    if (!bearerToken) {
      throw new Error('User authentication required');
    }

    const { data, error } = await supabase.auth.getUser(bearerToken);
    if (error || !data?.user?.id) {
      throw new Error('Unauthorized');
    }

    effectiveUserId = data.user.id;
  }

  if (!effectiveUserId) {
    throw new Error('User authentication required');
  }

  const { data: canWrite, error: canWriteError } = await supabase.rpc('can_write', {
    _user_id: effectiveUserId,
  });

  if (canWriteError) {
    throw new Error(`Failed to verify permissions: ${canWriteError.message}`);
  }

  if (!canWrite) {
    throw new Error('Forbidden');
  }

  return { effectiveUserId, isServiceRoleRequest };
}

async function getSharedAmmpApiKey(supabase: any): Promise<string> {
  const { data: latestConnection, error: latestError } = await supabase
    .from('ammp_connections')
    .select('api_key')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw new Error(`Failed to load AMMP connection: ${latestError.message}`);
  }

  if (!latestConnection?.api_key) {
    throw new Error('No shared AMMP API key found');
  }

  return latestConnection.api_key;
}

/**
 * Call the AMMP data API directly (see `_shared/ammpClient.ts` for why we no
 * longer hop through `ammp-data-proxy`). Retries never wait past the request
 * deadline.
 */
async function fetchAMMPData(token: string, path: string, method: string = 'GET'): Promise<any> {
  return fetchAmmpData(token, path, {
    method,
    deadline: Number.isFinite(requestDeadline) ? requestDeadline : undefined,
    logTag: 'ammp-sync-contract',
  });
}



/**
 * Calculate capabilities for a single asset
 */
function calculateCapabilities(
  asset: any,
  devices: any[],
  cachedOnboardingDate?: string | null,
  cachedSolcastOnboardingDate?: string | null
): AssetCapabilities {
  // Correct Solcast detection: data_provider === 'solcast' OR device_type === 'satellite'
  const hasSolcast = devices.some(d => 
    d.data_provider === 'solcast' || d.device_type === 'satellite'
  );
  
  // Find Solcast/satellite device's created date for pro-rata fee calculations
  // The 'created' field format: "2024-12-06T08:49:01.994000" (may include timezone later)
  const solcastDevice = devices.find(d => 
    d.data_provider === 'solcast' || d.device_type === 'satellite'
  );
  const solcastOnboardingDate = hasSolcast 
    ? (solcastDevice?.created || cachedSolcastOnboardingDate || null) 
    : null;
  
  // Battery detection
  const hasBattery = devices.some(d => 
    d.device_type === 'battery_system' || d.device_type === 'battery_inverter'
  );
  
  // Genset detection - includes genset_control which indicates hybrid systems
  const hasGenset = devices.some(d => 
    d.device_type === 'fuel_sensor' || 
    d.device_type === 'genset' ||
    d.device_type === 'genset_control' ||
    d.device_type === 'generator' ||
    d.device_type === 'diesel_generator'
  );
  
  // Correct Hybrid EMS detection: device_type === 'ems' AND name contains 'hybrid'
  const hasHybridEMS = devices.some(d => 
    d.device_type === 'ems' && d.device_name?.toLowerCase().includes('hybrid')
  );
  
  // Detect hybrid via meter names (genset/battery meters)
  const hasHybridMeter = devices.some(d => {
    if (d.device_type !== 'meter') return false;
    const name = (d.device_name || '').toLowerCase();
    return name.includes('gen') || 
           name.includes('genset') || 
           name.includes('generator') ||
           name.includes('battery') || 
           name.includes('batt') || 
           name.includes('bess');
  });
  
  // Use cached date first, then asset.created
  const onboardingDate = cachedOnboardingDate || asset.created || null;
  
  // Calculate capacity in kWp (total_pv_power is in Watts)
  const capacityKWp = (asset.total_pv_power || 0) / 1000;

  // Genset rating: AMMP returns `genset_capacity` in VA. `null` means "not set"
  // and must stay null — an explicit 0 is a distinct (reported) case.
  const gensetKVA =
    asset.genset_capacity != null && Number.isFinite(Number(asset.genset_capacity))
      ? Number(asset.genset_capacity) / 1000
      : null;

  return {
    assetId: asset.asset_id,
    assetName: asset.asset_name,
    totalMW: capacityKWp / 1000, // Convert kWp to MW
    capacityKWp,
    gensetKVA,
    hasSolcast,
    hasBattery,
    hasGenset,
    hasHybridEMS,
    hasHybridMeter,
    onboardingDate,
    solcastOnboardingDate,
    deviceCount: devices.length,
    devices: devices.map(d => ({
      deviceId: d.device_id,
      deviceName: d.device_name || 'Unknown Device',
      deviceType: d.device_type || 'unknown',
      manufacturer: d.manufacturer || null,
      model: d.model || null,
      dataProvider: d.data_provider || null,
    })),
  };
}

/**
 * Fetch asset group members from AMMP API.
 * Throws on failure — an empty array must only ever mean "the group is empty",
 * never "the call failed", otherwise a transient error silently drops sites
 * from the cached capabilities.
 */
let lastGroupFetchAt = 0;
const GROUP_FETCH_MIN_GAP_MS = 1200;

async function getAssetGroupMembers(token: string, groupId: string): Promise<{asset_id: string, asset_name: string}[]> {
  // Space consecutive group calls so back-to-back fetches don't trip the limiter
  const sinceLast = Date.now() - lastGroupFetchAt;
  if (lastGroupFetchAt > 0 && sinceLast < GROUP_FETCH_MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, GROUP_FETCH_MIN_GAP_MS - sinceLast));
  }
  lastGroupFetchAt = Date.now();
  console.log(`[AMMP Sync Contract] Fetching members for group ${groupId}`);

  let response: any;
  try {
    response = await fetchAMMPData(token, `/asset_groups/${groupId}/members`);
  } catch (error: any) {
    const message = error?.message ?? String(error);
    console.error(`[AMMP Sync Contract] Failed to fetch group ${groupId} members: ${message}`);
    if (/HTTP 404/.test(message) || /not found/i.test(message)) {
      const notFound = new Error(`Asset group ${groupId} no longer exists in AMMP`);
      (notFound as any).groupNotFound = true;
      throw notFound;
    }
    throw new Error(`Failed to fetch asset group ${groupId} members: ${message}`);
  }


  // API returns: { group_id, group_name, members: [...] }
  const members = response?.members || [];

  if (!Array.isArray(members)) {
    throw new Error(`Unexpected members payload for asset group ${groupId} (${typeof response})`);
  }

  console.log(`[AMMP Sync Contract] Found ${members.length} members in group ${groupId}`);
  return members.map((m: any) => ({
    asset_id: m.asset_id,
    asset_name: m.asset_name || 'Unknown'
  }));
}


interface AssetGroupMember {
  asset_id: string;
  asset_name: string;
}

// Tier flags, ClassifiedOrg and classifyOrgRow live in ../_shared/elumFlags.ts

/**
 * Request-level time budget. The edge gateway kills the request at 150s idle,
 * so every phase (org discovery, per-org asset resolution, asset batching)
 * must yield well before that and return a `partial` result instead of hanging.
 */
const REQUEST_BUDGET_MS = 110_000;
/**
 * Slice of the budget reserved for the asset loop. Org discovery and per-org
 * asset resolution must stop at `discoveryDeadline` so the loop can never be
 * left with zero time (which produces a 0-asset run that writes nothing).
 */
const ASSET_LOOP_RESERVE_MS = 40_000;
let requestDeadline = Number.POSITIVE_INFINITY;
let discoveryDeadline = Number.POSITIVE_INFINITY;
/** Globally excluded orgs skipped during this request's discovery (audit trail) */
let excludedOrgLog: Array<{ orgId: string; orgName: string }> = [];
const budgetExceeded = () => Date.now() > requestDeadline;
/** True once discovery has used everything except the asset-loop reserve. */
const discoveryBudgetExceeded = () => Date.now() > discoveryDeadline;


/**
 * Fetch sub-orgs of a parent org and classify them by AMMP feature flags.
 * Recurses one level into child orgs so nested organisations are not missed.
 * Throws on API failure so a partial org list can never silently shrink a tier.
 */
async function getClassifiedSubOrgs(
  token: string,
  parentOrgId: string,
  depth = 0,
  seen: Set<string> = new Set()
): Promise<ClassifiedOrg[]> {
  const response = await fetchAMMPData(token, `/orgs?parent_org_id=${encodeURIComponent(parentOrgId)}`);
  const orgs: any[] = Array.isArray(response) ? response : (response?.orgs || []);
  if (!Array.isArray(orgs)) {
    throw new Error(`Unexpected /orgs payload for parent ${parentOrgId}`);
  }

  // The API does not always honour parent_org_id — when the payload carries the
  // field, enforce the parent client-side so platform-wide orgs (other AMMP
  // customers, catch-all buckets) are never treated as Elum sub-orgs.
  const withParent = orgs.filter((o: any) => o?.parent_org_id);
  const scoped = withParent.length > 0
    ? orgs.filter((o: any) => !o?.parent_org_id || o.parent_org_id === parentOrgId)
    : orgs;
  if (scoped.length !== orgs.length) {
    console.log(`[AMMP Sync Contract] /orgs?parent_org_id=${parentOrgId}: ${orgs.length} returned, ${scoped.length} actually children`);
  }


  // Globally excluded orgs (e.g. Elum's virtual-assets org) are dropped here so
  // every downstream branch — tier resolution, Internal flag-first, coverage
  // checks and conflict flagging — never sees them.
  const direct = scoped
    .filter((o: any) => {
      if (!o?.org_id || o.org_id === parentOrgId || seen.has(o.org_id)) return false;
      if (isExcludedOrg(o.org_id)) {
        console.log(`[AMMP Sync Contract] Skipping excluded org ${o.org_name || o.org_id} (never billed)`);
        if (!excludedOrgLog.some(e => e.orgId === o.org_id)) {
          excludedOrgLog.push({ orgId: o.org_id, orgName: o.org_name || o.org_id });
        }
        seen.add(o.org_id);
        return false;
      }
      return true;
    })
    .map(classifyOrgRow);

  for (const o of direct) seen.add(o.orgId);


  // One level of nesting: grandchild orgs also carry tier flags
  if (depth < 1) {
    for (const child of [...direct]) {
      if (discoveryBudgetExceeded()) {
        console.warn(`[AMMP Sync Contract] Time budget reached during nested org discovery — stopping recursion`);
        break;
      }
      const nested = await getClassifiedSubOrgs(token, child.orgId, depth + 1, seen);
      if (nested.length > 0) {
        console.log(`[AMMP Sync Contract] ${nested.length} nested sub-orgs under ${child.orgName}`);
        direct.push(...nested);
      }
    }
  }

  return direct;
}

/** Fetch assets of a (sub-)org, bounded by this request's deadline. */
async function getAssetsForOrg(token: string, orgId: string): Promise<any[]> {
  return fetchOrgAssets(token, orgId, {
    deadline: Number.isFinite(requestDeadline) ? requestDeadline : undefined,
    logTag: 'ammp-sync-contract',
  });
}

/**
 * Process contract sync - handles ALL contract types
 * For asset group contracts: uses asset group filtering
 * For org-scoped contracts: uses org_id filtering  
 * For regular contracts: syncs all org assets
 */
async function processContractSync(
  supabase: any,
  contract: any,
  token: string,
  allAssets: any[],
  assetLookup: Map<string, any> // Pre-built lookup map from bulk /assets response
): Promise<SyncResult> {
  const packageType = contract.package;
  const contractId = contract.id;
  
  // Determine org ID: contract.ammp_org_id > customer.ammp_org_id
  const orgId = contract.ammp_org_id || contract.customers?.ammp_org_id;
  
  console.log(`[AMMP Sync Contract] Processing ${packageType} contract ${contractId}, orgId: ${orgId}`);
  
  // Get existing cached capabilities for continuation support
  const existingCached = contract.cached_capabilities as CachedCapabilities | null;
  const existingSyncStatus = contract.ammp_sync_status;
  
  // Build sets for continuation and date preservation
  const cachedDates: Record<string, string | null> = {};
  const cachedSolcastDates: Record<string, string | null> = {};
  const alreadySyncedIds = new Set<string>();
  const existingCapabilities: AssetCapabilities[] = [];
  
  if (existingCached?.assetBreakdown) {
    for (const asset of existingCached.assetBreakdown) {
      if (asset.assetId) {
        cachedDates[asset.assetId] = asset.onboardingDate || null;
        cachedSolcastDates[asset.assetId] = asset.solcastOnboardingDate || null;
        // Only use existing data for continuation if we're resuming a partial sync
        if (existingSyncStatus === 'partial') {
          alreadySyncedIds.add(asset.assetId);
          existingCapabilities.push(convertStoredToCapabilities(asset));
        }
      }
    }
  }
  
  if (alreadySyncedIds.size > 0) {
    console.log(`[AMMP Sync Contract] Resuming partial sync, ${alreadySyncedIds.size} assets already synced`);
  }
  
  let assetsToProcess: AssetGroupMember[] = [];
  // Elum 2026 org-based tiers: asset -> sub-org assignment built during resolution
  const assetOrgMap = new Map<string, ClassifiedOrg>();
  let tierOrgs: ClassifiedOrg[] = [];
  let unassignedOrgs: UnassignedOrgEntry[] = [];
  const orgResolutionLog: Array<{ orgId: string; orgName: string; assetCount: number; source: string; placeholders?: number; zeroCapacity?: number; zeroCapacityAssets?: Array<{ assetId: string; assetName: string }> }> = [];
  const doubleCountWarnings: Array<{ assetId: string; assetName: string; orgName: string }> = [];
  let resolutionTruncated = false;
  let tierConflictOrgs: Array<{ orgId: string; orgName: string; tiers: string[] }> = [];
  // Legacy asset group resolution, hoisted so the unassigned-org coverage check can read it
  let legacyMemberIds = new Set<string>();
  let legacyEconfIds = new Set<string>();
  let legacyExcludedIds = new Set<string>();
  let hasNotGroup = false;

  const elumTier: string | null = contract.elum_tier || null;
  const elumParentOrgId: string | null = contract.elum_parent_org_id || null;
  
  // Determine which assets to process based on contract configuration
  if (elumTier && elumParentOrgId) {
    // Discover sub-orgs under the Elum parent org and keep those on this tier
    const subOrgs = await getClassifiedSubOrgs(token, elumParentOrgId);
    tierOrgs = subOrgs.filter(o => o.tier === elumTier);
    // Flag-less sub-orgs: names only here. Their asset lists are resolved with
    // the org-scoped endpoint in the coverage pass below — filtering the global
    // /assets list on org_id attributes almost every asset in the account to a
    // catch-all org and massively over-reports "unassigned" assets.
    unassignedOrgs = subOrgs
      .filter(o => o.tier === null)
      .map(o => ({ orgId: o.orgId, orgName: o.orgName }));
    // Orgs with 2+ conflicting non-internal billing flags (remote_econf and
    // internal combinations are legitimate and never flagged).
    tierConflictOrgs = subOrgs
      .filter(hasTierConflict)
      .map(o => ({ orgId: o.orgId, orgName: o.orgName, tiers: o.matchedTiers }));
    console.log(`[AMMP Sync Contract] Elum ${elumTier}: ${tierOrgs.length} orgs (${subOrgs.length} sub-orgs, ${unassignedOrgs.length} without a tier flag, ${tierConflictOrgs.length} with conflicting tier flags)`);

    
    // Resolve assets per sub-org via the org-scoped assets endpoint.
    // A failed fetch throws (preserving the previous cache) instead of silently
    // reporting the org as empty.
    for (const org of tierOrgs) {
      let orgAssets: any[];
      let source: string;
      if (discoveryBudgetExceeded()) {
        // Out of time for org-scoped calls — use the already-fetched global list
        // so the org still contributes assets, and mark the sync as partial.
        resolutionTruncated = true;
        orgAssets = allAssets.filter((a: any) => a.org_id === org.orgId);
        source = 'global-fallback (time budget)';
      } else {
        orgAssets = await getAssetsForOrg(token, org.orgId);
        source = 'org-scoped';
        if (orgAssets.length === 0) {
          orgAssets = allAssets.filter((a: any) => a.org_id === org.orgId);
          source = orgAssets.length > 0 ? 'global-fallback' : 'empty';
        }
      }
      for (const a of orgAssets) {
        if (assetOrgMap.has(a.asset_id)) continue;
        assetOrgMap.set(a.asset_id, org);
        assetsToProcess.push({ asset_id: a.asset_id, asset_name: a.asset_name });
        if (!assetLookup.has(a.asset_id)) assetLookup.set(a.asset_id, a);
      }
      orgResolutionLog.push({ orgId: org.orgId, orgName: org.orgName, assetCount: orgAssets.length, source });
      console.log(`[AMMP Sync Contract] Sub-org ${org.orgName} (${org.tier}): ${orgAssets.length} assets via ${source}`);
    }

    if (contract.ammp_asset_group_id) {
      // Legacy asset group members are split into two pseudo-orgs so a single
      // contract can carry both the standard tier rate and the eConf add-on
      // rate. The AND group (e.g. "[Add-on] Remote eConf") marks eConf members;
      // the NOT group excludes members outright.
      const baseOrg: ClassifiedOrg = {
        orgId: `legacy:${contract.ammp_asset_group_id}:base`,
        orgName: 'Legacy asset group — standard',
        tier: elumTier,
        hasEconf: false,
      };
      const econfOrg: ClassifiedOrg = {
        orgId: `legacy:${contract.ammp_asset_group_id}:econf`,
        orgName: 'Legacy asset group — with eConf',
        tier: elumTier,
        hasEconf: true,
      };

      const safeGroupMembers = async (gid: string) => {
        try {
          return await getAssetGroupMembers(token, gid);
        } catch (e: any) {
          if (e?.groupNotFound) {
            console.warn(`[AMMP Sync Contract] Skipping missing asset group ${gid} — treated as empty`);
            return [];
          }
          throw e;
        }
      };

      const members = await safeGroupMembers(contract.ammp_asset_group_id);
      legacyMemberIds = new Set(members.map((m) => m.asset_id));

      let econfIds = new Set<string>();
      if (contract.ammp_asset_group_id_and) {
        const andMembers = await safeGroupMembers(contract.ammp_asset_group_id_and);
        econfIds = new Set(andMembers.map((m) => m.asset_id));
      }
      let excludedIds = new Set<string>();
      if (contract.ammp_asset_group_id_not) {
        const notMembers = await safeGroupMembers(contract.ammp_asset_group_id_not);
        excludedIds = new Set(notMembers.map((m) => m.asset_id));
      }

      legacyEconfIds = econfIds;
      legacyExcludedIds = excludedIds;
      hasNotGroup = !!contract.ammp_asset_group_id_not;

      let baseCount = 0;
      let econfCount = 0;
      let excludedCount = 0;
      for (const m of members) {
        if (excludedIds.has(m.asset_id)) {
          excludedCount++;
          continue;
        }
        const existing = assetOrgMap.get(m.asset_id);
        if (existing) {
          // Asset resolved from both sources — counted once (org side wins)
          doubleCountWarnings.push({ assetId: m.asset_id, assetName: m.asset_name, orgName: existing.orgName });
          continue;
        }
        const target = econfIds.has(m.asset_id) ? econfOrg : baseOrg;
        if (target === econfOrg) econfCount++; else baseCount++;
        assetOrgMap.set(m.asset_id, target);
        assetsToProcess.push({ asset_id: m.asset_id, asset_name: m.asset_name });
      }

      const legacySegments: ClassifiedOrg[] = [];
      if (baseCount > 0) legacySegments.push(baseOrg);
      if (econfCount > 0) legacySegments.push(econfOrg);
      for (const seg of legacySegments) (seg as any).isLegacyAssetGroup = true;
      if (legacySegments.length > 0) tierOrgs = [...tierOrgs, ...legacySegments];

      if (baseCount > 0) orgResolutionLog.push({ orgId: baseOrg.orgId, orgName: baseOrg.orgName, assetCount: baseCount, source: 'legacy-group' });
      if (econfCount > 0) orgResolutionLog.push({ orgId: econfOrg.orgId, orgName: econfOrg.orgName, assetCount: econfCount, source: 'legacy-group' });

      console.log(
        `[AMMP Sync Contract] Legacy asset group merged: ${members.length} members -> ${baseCount} standard, ${econfCount} eConf, ${excludedCount} excluded, ${doubleCountWarnings.length} overlaps de-duplicated`
      );

    }

    // Coverage check: for each flag-less sub-org, classify its assets against the
    // legacy asset group resolution so covered assets are not reported as leakage.
    if (unassignedOrgs.length > 0) {
      // Sibling Elum tier contracts (e.g. Lite when syncing Pro) — an asset that
      // sits in another tier's legacy asset group is already billed there.
      const siblingGroups: Array<{ tierName: string; ids: Set<string> }> = [];
      // A sibling group that was deleted in AMMP is a definitive answer (no members):
      // we self-heal the stale pointer instead of degrading coverage detail.
      const missingSiblingGroups: string[] = [];
      let siblingLookupIncomplete = false;
      if (!resolutionTruncated) {
        const { data: siblings } = await supabase
          .from('contracts')
          .select('id, contract_name, elum_tier, ammp_asset_group_id')
          .eq('elum_parent_org_id', elumParentOrgId)
          .eq('contract_status', 'active')
          .not('elum_tier', 'is', null)
          .neq('id', contract.id);
        const seenGroups = new Set<string>([contract.ammp_asset_group_id].filter(Boolean) as string[]);
        for (const s of siblings || []) {
          const gid = s.ammp_asset_group_id;
          if (!gid || seenGroups.has(gid)) continue;
          seenGroups.add(gid);
          if (discoveryBudgetExceeded()) {
            resolutionTruncated = true;
            break;
          }
          try {
            const members = await getAssetGroupMembers(token, gid);
            siblingGroups.push({
              tierName: s.contract_name || s.elum_tier || 'other tier',
              ids: new Set(members.map((m) => m.asset_id)),
            });
          } catch (e: any) {
            if (e?.groupNotFound) {
              // Deleted in AMMP — clear the stale pointer so this never recurs.
              missingSiblingGroups.push(gid);
              const { error: healErr } = await supabase
                .from('contracts')
                .update({ ammp_asset_group_id: null, ammp_asset_group_name: null })
                .eq('id', s.id);
              console.warn(
                `[AMMP Sync Contract] Sibling asset group ${gid} (contract "${s.contract_name || s.elum_tier}") no longer exists in AMMP — cleared stale reference${healErr ? ` (clear failed: ${healErr.message})` : ''}`
              );
              continue;
            }
            console.warn(`[AMMP Sync Contract] Sibling group ${gid} lookup failed:`, e);
            siblingLookupIncomplete = true;
            resolutionTruncated = true;
          }
        }
      }


      let totalCovered = 0;
      let totalElsewhere = 0;
      let totalUncovered = 0;
      const resolved: UnassignedOrgEntry[] = [];
      for (const o of unassignedOrgs) {
        if (discoveryBudgetExceeded()) {
          resolutionTruncated = true;
          resolved.push({ ...o, partial: true, source: 'unresolved' });
          continue;
        }

        let orgAssets: any[];
        try {
          orgAssets = await getAssetsForOrg(token, o.orgId);
        } catch (e) {
          console.warn(`[AMMP Sync Contract] Flag-less org ${o.orgName} lookup failed:`, e);
          resolved.push({ ...o, partial: true, source: 'unresolved' });
          continue;
        }
        const globalCount = allAssets.filter((a: any) => a.org_id === o.orgId).length;
        if (globalCount !== orgAssets.length) {
          console.log(
            `[AMMP Sync Contract] Flag-less org ${o.orgName}: org-scoped ${orgAssets.length} assets (global-list filter would report ${globalCount})`
          );
        }

        let coveredStandard = 0;
        let coveredEconf = 0;
        let excluded = 0;
        let coveredElsewhere = 0;
        let uncovered = 0;
        let uncoveredMW = 0;
        let placeholders = 0;
        const uncoveredAssets: Array<{ assetId: string; assetName: string; mw: number }> = [];
        const coveredElsewhereAssets: Array<{ assetId: string; assetName: string; tierName: string }> = [];
        for (const a of orgAssets) {
          const mw = (a.total_pv_power || 0) / 1_000_000;
          // AMMP catch-all orgs are full of never-configured stub assets: no PV
          // capacity, no location, no tags. They are not billable and must not
          // be reported as revenue leakage.
          const isPlaceholder =
            (a.total_pv_power === null || a.total_pv_power === undefined) &&
            !a.long_name && !a.country_code && !a.latitude && !a.tags;
          if (isPlaceholder) {
            placeholders++;
            continue;
          }
          if (hasNotGroup && legacyExcludedIds.has(a.asset_id)) {
            excluded++;
            continue;
          }

          if (legacyMemberIds.has(a.asset_id)) {
            if (legacyEconfIds.has(a.asset_id)) coveredEconf++; else coveredStandard++;
            continue;
          }
          if (assetOrgMap.has(a.asset_id)) {
            coveredStandard++;
            continue;
          }
          const sibling = siblingGroups.find((g) => g.ids.has(a.asset_id));
          if (sibling) {
            coveredElsewhere++;
            if (coveredElsewhereAssets.length < 20) {
              coveredElsewhereAssets.push({ assetId: a.asset_id, assetName: a.asset_name, tierName: sibling.tierName });
            }
            continue;
          }
          uncovered++;
          uncoveredMW += mw;
          if (uncoveredAssets.length < 20) {
            uncoveredAssets.push({ assetId: a.asset_id, assetName: a.asset_name, mw });
          }
        }
        totalCovered += coveredStandard + coveredEconf;
        totalElsewhere += coveredElsewhere;
        totalUncovered += uncovered;
        resolved.push({
          ...o,
          source: 'org-scoped',
          ...(siblingLookupIncomplete ? { siblingIncomplete: true } : {}),
          assetCount: orgAssets.length - placeholders,
          placeholders,
          totalMW: orgAssets.reduce((s: number, a: any) => s + (a.total_pv_power || 0) / 1_000_000, 0),
          coveredStandard,
          coveredEconf,
          ...(hasNotGroup ? { excluded } : {}),
          coveredElsewhere,
          coveredElsewhereAssets: coveredElsewhereAssets.length > 0 ? coveredElsewhereAssets : undefined,
          uncovered,
          uncoveredMW,
          uncoveredAssets: uncoveredAssets.length > 0 ? uncoveredAssets : undefined,
        });

      }
      unassignedOrgs = resolved;

      console.log(
        `[AMMP Sync Contract] Unassigned sub-org coverage: ${totalCovered} covered by this legacy group, ${totalElsewhere} covered by another tier group, ${totalUncovered} not covered${resolutionTruncated ? ' (partially skipped — ran out of time budget)' : ''}${missingSiblingGroups.length > 0 ? ` (stale sibling asset group reference(s) cleared: ${missingSiblingGroups.join(', ')})` : ''}`

      );
    }


    
    if (tierOrgs.length > 0 && assetsToProcess.length === 0) {
      console.warn(`[AMMP Sync Contract] No assets found for ${tierOrgs.length} ${elumTier} sub-orgs`);
    }
    console.log(`[AMMP Sync Contract] Elum org-based resolution: ${assetsToProcess.length} assets`);

  } else if (packageType === 'enterprise_econf' && (orgId || contract.ammp_asset_group_id)) {
    // Enterprise eConf: the billable portfolio is the whole AMMP organisation.
    // The AND group marks the eConf upgrade (higher rate), the NOT group
    // excludes sites. Members are split into two pseudo-orgs so pricing can
    // apply the base rate and the base+eConf rate side by side.
    const segmentKey = orgId ? `org:${orgId}` : `assetgroup:${contract.ammp_asset_group_id}`;
    const baseOrg: ClassifiedOrg = {
      orgId: `${segmentKey}:base`,
      orgName: 'Standard sites',
      tier: null,
      hasEconf: false,
    };
    const econfOrg: ClassifiedOrg = {
      orgId: `${segmentKey}:econf`,
      orgName: 'eConf upgrade sites',
      tier: null,
      hasEconf: true,
    };

    // Org ID is the primary source; fall back to the legacy primary asset group.
    let members: Array<{ asset_id: string; asset_name: string; raw?: any }>;
    if (orgId) {
      const orgAssets = await getAssetsForOrg(token, orgId);
      members = orgAssets.map((a: any) => ({ asset_id: a.asset_id, asset_name: a.asset_name, raw: a }));
    } else {
      members = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
    }

    let econfIds = new Set<string>();
    if (contract.ammp_asset_group_id_and) {
      const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
      econfIds = new Set(andMembers.map((m) => m.asset_id));
    }
    let excludedIds = new Set<string>();
    if (contract.ammp_asset_group_id_not) {
      const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
      excludedIds = new Set(notMembers.map((m) => m.asset_id));
    }

    let baseCount = 0;
    let econfCount = 0;
    let excludedCount = 0;
    // Zero-capacity sites are still billed; they are only surfaced for review so
    // the existing zero-PV alert / revision flow can handle them.
    const zeroCapacityAssets: Array<{ assetId: string; assetName: string }> = [];
    for (const m of members) {
      const a = m.raw;
      if (excludedIds.has(m.asset_id)) {
        excludedCount++;
        continue;
      }
      if (
        a &&
        (a.total_pv_power === null || a.total_pv_power === undefined || a.total_pv_power === 0)
      ) {
        zeroCapacityAssets.push({ assetId: m.asset_id, assetName: m.asset_name });
      }
      const target = econfIds.has(m.asset_id) ? econfOrg : baseOrg;
      if (target === econfOrg) econfCount++; else baseCount++;
      assetOrgMap.set(m.asset_id, target);
      assetsToProcess.push({ asset_id: m.asset_id, asset_name: m.asset_name });
    }

    if (baseCount > 0) tierOrgs.push(baseOrg);
    if (econfCount > 0) tierOrgs.push(econfOrg);
    for (const seg of tierOrgs) (seg as any).isLegacyAssetGroup = true;
    if (baseCount > 0) orgResolutionLog.push({
      orgId: baseOrg.orgId,
      orgName: baseOrg.orgName,
      assetCount: baseCount,
      source: orgId ? 'org-scoped' : 'asset-group',
      zeroCapacity: zeroCapacityAssets.length,
      zeroCapacityAssets: zeroCapacityAssets.slice(0, 50),
    });
    if (econfCount > 0) orgResolutionLog.push({ orgId: econfOrg.orgId, orgName: econfOrg.orgName, assetCount: econfCount, source: orgId ? 'org-scoped' : 'asset-group' });

    console.log(
      `[AMMP Sync Contract] Enterprise eConf (${orgId ? `org ${orgId}` : 'asset group'}): ${members.length} assets -> ${baseCount} standard, ${econfCount} eConf, ${excludedCount} excluded, ${zeroCapacityAssets.length} zero-capacity (billed)`
    );

  } else if (packageType === 'elum_internal' && (elumParentOrgId || orgId)) {
    // Elum Internal (legacy graduated MW): resolve sites from sub-orgs carrying
    // the `elum_internal` feature flag first. The configured asset group is only
    // used when no flagged sub-org is found (handled by the fallback below).
    const parentForFlags = elumParentOrgId || orgId!;
    let flaggedOrgs: ClassifiedOrg[] = [];
    try {
      const subOrgs = await getClassifiedSubOrgs(token, parentForFlags);
      flaggedOrgs = subOrgs.filter((o) => o.tier === 'internal');
    } catch (e) {
      console.warn(`[AMMP Sync Contract] Elum Internal flag discovery failed for ${parentForFlags}: ${(e as any)?.message}`);
    }

    if (flaggedOrgs.length > 0) {
      // NOT group still excludes sites even when orgs come from feature flags
      let excludedIds = new Set<string>();
      if (contract.ammp_asset_group_id_not) {
        try {
          const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
          excludedIds = new Set(notMembers.map((m) => m.asset_id));
        } catch (e: any) {
          if (!e?.groupNotFound) throw e;
          console.warn(`[AMMP Sync Contract] NOT group ${contract.ammp_asset_group_id_not} missing — no exclusions applied`);
        }
      }

      let excludedCount = 0;
      for (const org of flaggedOrgs) {
        let orgAssets: any[];
        let source: string;
        if (discoveryBudgetExceeded()) {
          resolutionTruncated = true;
          orgAssets = allAssets.filter((a: any) => a.org_id === org.orgId);
          source = 'global-fallback (time budget)';
        } else {
          orgAssets = await getAssetsForOrg(token, org.orgId);
          source = 'org-scoped';
          if (orgAssets.length === 0) {
            orgAssets = allAssets.filter((a: any) => a.org_id === org.orgId);
            source = orgAssets.length > 0 ? 'global-fallback' : 'empty';
          }
        }
        let kept = 0;
        for (const a of orgAssets) {
          if (excludedIds.has(a.asset_id)) { excludedCount++; continue; }
          if (assetOrgMap.has(a.asset_id)) continue;
          assetOrgMap.set(a.asset_id, org);
          assetsToProcess.push({ asset_id: a.asset_id, asset_name: a.asset_name });
          if (!assetLookup.has(a.asset_id)) assetLookup.set(a.asset_id, a);
          kept++;
        }
        orgResolutionLog.push({ orgId: org.orgId, orgName: org.orgName, assetCount: kept, source: `feature-flag elum_internal / ${source}` });
      }
      tierOrgs = [...flaggedOrgs];

      console.log(
        `[AMMP Sync Contract] Elum Internal: ${flaggedOrgs.length} flagged sub-org(s) -> ${assetsToProcess.length} assets (${excludedCount} excluded)`
      );
    }

    if (assetsToProcess.length === 0 && contract.ammp_asset_group_id) {
      // Fallback: legacy asset group resolution
      console.log('[AMMP Sync Contract] Elum Internal: no elum_internal sub-orgs found — falling back to asset group');
      const primaryMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
      assetsToProcess = [...primaryMembers];
      if (contract.ammp_asset_group_id_and) {
        const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
        const andIds = new Set(andMembers.map((m) => m.asset_id));
        assetsToProcess = assetsToProcess.filter((m) => andIds.has(m.asset_id));
      }
      if (contract.ammp_asset_group_id_not) {
        const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
        const notIds = new Set(notMembers.map((m) => m.asset_id));
        assetsToProcess = assetsToProcess.filter((m) => !notIds.has(m.asset_id));
      }
      orgResolutionLog.push({
        orgId: `assetgroup:${contract.ammp_asset_group_id}`,
        orgName: contract.ammp_asset_group_name || 'Asset group (fallback)',
        assetCount: assetsToProcess.length,
        source: 'asset-group',
      });
      console.log(`[AMMP Sync Contract] Elum Internal asset-group fallback: ${assetsToProcess.length} assets`);
    } else if (assetsToProcess.length === 0) {
      console.warn('[AMMP Sync Contract] Elum Internal: no flagged sub-orgs and no asset group configured');
    }

  } else if (contract.ammp_asset_group_id) {

    // Asset group filtering (for elum_epm, elum_jubaili, or any contract with asset group)
    const primaryMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id);
    assetsToProcess = [...primaryMembers];
    
    // Apply AND filter if configured
    if (contract.ammp_asset_group_id_and) {
      const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
      const andIds = new Set(andMembers.map(m => m.asset_id));
      assetsToProcess = assetsToProcess.filter(m => andIds.has(m.asset_id));
    }
    
    // Apply NOT filter if configured
    if (contract.ammp_asset_group_id_not) {
      const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
      const notIds = new Set(notMembers.map(m => m.asset_id));
      assetsToProcess = assetsToProcess.filter(m => !notIds.has(m.asset_id));
    }
    
    console.log(`[AMMP Sync Contract] Asset group filtering: ${assetsToProcess.length} assets`);
  } else if (orgId) {
    // Filter by org ID (for regular contracts or elum_portfolio_os with custom org)
    const orgAssets = allAssets.filter((a: any) => a.org_id === orgId);
    assetsToProcess = orgAssets.map((a: any) => ({ asset_id: a.asset_id, asset_name: a.asset_name }));
    console.log(`[AMMP Sync Contract] Org ${orgId} initial filtering: ${assetsToProcess.length} assets`);
    
    // Apply AND filter if configured (intersection with AND group)
    if (contract.ammp_asset_group_id_and) {
      const andMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_and);
      const andIds = new Set(andMembers.map(m => m.asset_id));
      assetsToProcess = assetsToProcess.filter(m => andIds.has(m.asset_id));
      console.log(`[AMMP Sync Contract] AND filter applied: ${assetsToProcess.length} assets remain`);
    }
    
    // Apply NOT filter if configured (exclude assets in NOT group)
    if (contract.ammp_asset_group_id_not) {
      const notMembers = await getAssetGroupMembers(token, contract.ammp_asset_group_id_not);
      const notIds = new Set(notMembers.map(m => m.asset_id));
      const beforeCount = assetsToProcess.length;
      assetsToProcess = assetsToProcess.filter(m => !notIds.has(m.asset_id));
      console.log(`[AMMP Sync Contract] NOT filter applied: excluded ${beforeCount - assetsToProcess.length} assets, ${assetsToProcess.length} remain`);
    }
  } else {
    console.log(`[AMMP Sync Contract] No org ID or asset group for contract ${contractId}`);
    return {
      cachedCapabilities: {
        totalMW: 0,
        totalSites: 0,
        ongridMW: 0,
        hybridMW: 0,
        ongridSites: 0,
        hybridSites: 0,
        sitesWithSolcast: 0,
        assetBreakdown: [],
        lastSynced: new Date().toISOString(),
      },
      syncStatus: 'synced',
      timedOut: false,
      totalExpected: 0,
      previouslySynced: 0,
      newlySynced: 0,
      previousSyncStatus: existingSyncStatus,
    };
  }
  
  const totalExpected = assetsToProcess.length;
  
  if (assetsToProcess.length === 0) {
    console.log(`[AMMP Sync Contract] No assets found for contract ${contractId}`);
    return {
      cachedCapabilities: {
        totalMW: 0,
        totalSites: 0,
        ongridMW: 0,
        hybridMW: 0,
        ongridSites: 0,
        hybridSites: 0,
        sitesWithSolcast: 0,
        assetBreakdown: [],
        lastSynced: new Date().toISOString(),
      },
      syncStatus: 'synced',
      timedOut: false,
      totalExpected: 0,
      previouslySynced: 0,
      newlySynced: 0,
      previousSyncStatus: existingSyncStatus,
    };
  }
  
  // Filter out already-synced assets for continuation
  const assetsToActuallyProcess = assetsToProcess.filter(a => !alreadySyncedIds.has(a.asset_id));
  console.log(`[AMMP Sync Contract] ${totalExpected} total assets, ${assetsToActuallyProcess.length} need processing`);

  // Jubaili is priced on the genset rating, and `genset_capacity` is only
  // returned by the org-scoped assets call — build a rating lookup once per
  // sync (keyed by asset_id) instead of hitting the per-asset details endpoint.
  const gensetCapacityByAsset = new Map<string, number | null>();
  let ratingFetchFailed = false;
  if (packageType === 'elum_jubaili') {
    const ratingOrgId =
      orgId || contract.contract_ammp_org_id || contract.customers?.ammp_org_id || null;
    if (ratingOrgId) {
      try {
        const orgAssets = await getAssetsForOrg(token, ratingOrgId);
        for (const a of orgAssets) {
          gensetCapacityByAsset.set(a.asset_id, a.genset_capacity ?? null);
        }
        const rated = [...gensetCapacityByAsset.values()].filter(v => v != null).length;
        const matched = assetsToProcess.filter(a => gensetCapacityByAsset.has(a.asset_id)).length;
        const matchedRated = assetsToProcess.filter(
          a => gensetCapacityByAsset.get(a.asset_id) != null
        ).length;
        console.log(
          `[AMMP Sync Contract] Jubaili genset ratings (org ${ratingOrgId}): ` +
            `${rated}/${gensetCapacityByAsset.size} org assets rated; ` +
            `${matched}/${assetsToProcess.length} contract assets matched, ${matchedRated} rated`
        );
        if (matched === 0) {
          console.warn(
            `[AMMP Sync Contract] Jubaili contract ${contractId}: no contract asset matched the org rating list — check the org ID`
          );
        }
      } catch (e) {
        // A failed fetch must not be written as "no site is rated" — keep the
        // sync partial so the previous ratings survive.
        ratingFetchFailed = true;
        console.error(`[AMMP Sync Contract] Failed to fetch genset ratings for org ${ratingOrgId}:`, e);
      }
    } else {
      ratingFetchFailed = true;
      console.warn(`[AMMP Sync Contract] Jubaili contract ${contractId} has no org ID — cannot resolve genset ratings`);
    }
  }

  
  
  // Batch fetch full asset data (metadata + devices) for each asset
  const newCapabilities: AssetCapabilities[] = [];
  const BATCH_SIZE = 50; // Increased from 10 for better parallelization
  const MAX_SYNC_TIME_MS = 50000; // 50 seconds safety margin before timeout
  const syncStartTime = Date.now();
  
  // For large syncs (>200 assets), skip device details to avoid timeout
  const skipDevices = assetsToActuallyProcess.length > 200;
  if (skipDevices) {
    console.log(`[AMMP Sync Contract] Large sync (${assetsToActuallyProcess.length} assets) - skipping device details`);
  }
  
  let timedOut = resolutionTruncated || ratingFetchFailed;
  
  for (let i = 0; i < assetsToActuallyProcess.length; i += BATCH_SIZE) {
    // Check for timeout before processing batch (per-phase budget and request budget)
    if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS || budgetExceeded()) {
      console.log(`[AMMP Sync Contract] Timeout approaching, saving partial progress (${newCapabilities.length} new + ${existingCapabilities.length} existing)`);
      timedOut = true;
      break;
    }
    
    const batch = assetsToActuallyProcess.slice(i, i + BATCH_SIZE);
    
    const batchPromises = batch.map(async (member) => {
      try {
        // Use pre-fetched asset data from bulk /assets call (OPTIMIZATION: no per-asset API call)
        // This eliminates ~757 redundant API calls for large portfolios like Daybreak
        const assetData = assetLookup.get(member.asset_id) || { 
          asset_id: member.asset_id, 
          asset_name: member.asset_name,
          total_pv_power: 0,
          created: null 
        };
        
        // Fetch devices for capability detection (skip for large syncs)
        let devices: any[] = [];
        if (!skipDevices) {
          try {
            const devicesResponse = await fetchAMMPData(token, `/assets/${member.asset_id}/devices?include_virtual=true`);
            devices = devicesResponse.devices || devicesResponse || [];
            if (!Array.isArray(devices)) devices = [];
          } catch (deviceError) {
            console.warn(`[AMMP Sync Contract] No devices for ${member.asset_id}`);
          }
        }
        
        // Use cached onboarding date if available, otherwise use asset.created from bulk response
        const cachedDate = cachedDates[member.asset_id] || assetData.created || null;
        const cachedSolcastDate = cachedSolcastDates[member.asset_id] || null;
        
        return calculateCapabilities(
          {
            ...assetData,
            asset_id: member.asset_id,
            asset_name: member.asset_name,
            // Ratings come from the org-scoped lookup when available
            genset_capacity: gensetCapacityByAsset.has(member.asset_id)
              ? gensetCapacityByAsset.get(member.asset_id)
              : assetData.genset_capacity ?? null,
          },
          devices,
          cachedDate,
          cachedSolcastDate
        );
      } catch (error) {
        console.error(`[AMMP Sync Contract] Error processing asset ${member.asset_id}:`, error);
        return {
          assetId: member.asset_id,
          assetName: member.asset_name,
          totalMW: 0,
          capacityKWp: 0,
          gensetKVA: null,
          hasSolcast: false,
          hasBattery: false,
          hasGenset: false,
          hasHybridEMS: false,
          hasHybridMeter: false,
          onboardingDate: cachedDates[member.asset_id] || null,
          solcastOnboardingDate: cachedSolcastDates[member.asset_id] || null,
          deviceCount: 0,
          devices: [],
        };
      }
    });
    
    const batchResults = await Promise.all(batchPromises);
    newCapabilities.push(...batchResults);
    
    const elapsedSec = ((Date.now() - syncStartTime) / 1000).toFixed(1);
    const totalProcessed = existingCapabilities.length + newCapabilities.length;
    console.log(`[AMMP Sync Contract] Progress: ${totalProcessed}/${totalExpected} (${elapsedSec}s)`);
  }
  
  // Merge existing (from partial) + new capabilities
  const allCapabilities = [...existingCapabilities, ...newCapabilities];
  
  // Deduplicate by assetId (in case of any overlap)
  const uniqueAssets = new Map<string, AssetCapabilities>();
  for (const asset of allCapabilities) {
    uniqueAssets.set(asset.assetId, asset);
  }
  
  // Post-process: fetch onboarding dates for assets missing them
  const assetsMissingDate = Array.from(uniqueAssets.values()).filter(a => !a.onboardingDate && a.assetId);
  if (assetsMissingDate.length > 0) {
    console.log(`[AMMP Sync Contract] Fetching onboarding dates for ${assetsMissingDate.length} assets missing dates`);
    const DATE_BATCH = 50;
    for (let i = 0; i < assetsMissingDate.length; i += DATE_BATCH) {
      if (Date.now() - syncStartTime > MAX_SYNC_TIME_MS) {
        console.log(`[AMMP Sync Contract] Timeout during date fetching, ${assetsMissingDate.length - i} assets still missing dates`);
        break;
      }
      const batch = assetsMissingDate.slice(i, i + DATE_BATCH);
      await Promise.all(batch.map(async (asset) => {
        try {
          const metadata = await fetchAMMPData(token, `/assets/${asset.assetId}`);
          if (metadata?.created) {
            asset.onboardingDate = metadata.created;
            // Update in the map too
            uniqueAssets.set(asset.assetId, asset);
          }
        } catch {
          // Skip - asset date will remain null
        }
      }));
    }
    const stillMissing = Array.from(uniqueAssets.values()).filter(a => !a.onboardingDate && a.assetId).length;
    console.log(`[AMMP Sync Contract] After date fetching: ${stillMissing} assets still missing onboarding dates`);
  }
  
  const finalCapabilities = Array.from(uniqueAssets.values());
  
  // Aggregate data
  const ongridSites = finalCapabilities.filter(c => !c.hasBattery && !c.hasGenset && !c.hasHybridEMS);
  const hybridSites = finalCapabilities.filter(c => c.hasBattery || c.hasGenset || c.hasHybridEMS);
  
  const cachedCapabilities: CachedCapabilities = {
    totalMW: finalCapabilities.reduce((sum, cap) => sum + cap.totalMW, 0),
    ongridMW: ongridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    hybridMW: hybridSites.reduce((sum, cap) => sum + cap.totalMW, 0),
    totalSites: finalCapabilities.length,
    ongridSites: ongridSites.length,
    hybridSites: hybridSites.length,
    sitesWithSolcast: 0, // recalculated below after preserving enriched data
    assetBreakdown: finalCapabilities.map(c => {
      // Preserve enriched device data from existing cache when sync skipped devices (large portfolio)
      const existingAsset = existingCached?.assetBreakdown?.find(a => a.assetId === c.assetId);
      const hasExistingEnrichment = existingAsset?.deviceEnrichmentAttempted && 
        existingAsset?.devices && existingAsset.devices.length > 0;
      const useExisting = c.deviceCount === 0 && hasExistingEnrichment;
      
      return {
        assetId: c.assetId,
        assetName: c.assetName,
        totalMW: c.totalMW,
        capacityKWp: c.capacityKWp,
        // Ratings come from the org-scoped lookup (also for assets carried over
        // from a previous partial sync, which may predate the rating support).
        gensetKVA:
          gensetCapacityByAsset.get(c.assetId) != null
            ? Number(gensetCapacityByAsset.get(c.assetId)) / 1000
            : c.gensetKVA ?? existingAsset?.gensetKVA ?? null,

        isHybrid: useExisting ? existingAsset.isHybrid : (c.hasBattery || c.hasGenset || c.hasHybridEMS || c.hasHybridMeter),
        hasSolcast: useExisting ? existingAsset.hasSolcast : c.hasSolcast,
        deviceCount: useExisting ? existingAsset.deviceCount : c.deviceCount,
        onboardingDate: c.onboardingDate,
        solcastOnboardingDate: useExisting ? (existingAsset.solcastOnboardingDate || c.solcastOnboardingDate) : c.solcastOnboardingDate,
        devices: useExisting ? existingAsset.devices : c.devices,
        deviceEnrichmentAttempted: existingAsset?.deviceEnrichmentAttempted || false,
        deviceEnrichmentConfirmedEmpty: useExisting ? existingAsset.deviceEnrichmentConfirmedEmpty : undefined,
      };
    }),
    lastSynced: new Date().toISOString(),
    // Flag for device enrichment if:
    // 1. This is a large portfolio (>200 assets total), OR
    // 2. We have assets without devices that haven't been enrichment-attempted
    orgBreakdown: assetOrgMap.size > 0
      ? tierOrgs.map(org => ({
          orgId: org.orgId,
          orgName: org.orgName,
          uid: org.uid,
          tier: org.tier,
          hasEconf: org.hasEconf,
          isLegacyAssetGroup: (org as any).isLegacyAssetGroup === true,
          assets: finalCapabilities
            .filter(c => assetOrgMap.get(c.assetId)?.orgId === org.orgId)
            .map(c => ({ assetId: c.assetId, assetName: c.assetName, totalMW: c.totalMW })),
        }))
      : undefined,
    doubleCountWarnings: doubleCountWarnings.length > 0 ? doubleCountWarnings : undefined,
    unassignedOrgs: unassignedOrgs.length > 0 ? unassignedOrgs : undefined,
    tierConflictOrgs: tierConflictOrgs.length > 0 ? tierConflictOrgs : undefined,
    orgResolution: orgResolutionLog.length > 0 ? orgResolutionLog : undefined,
    needsDeviceEnrichment: totalExpected > 200 || 
      finalCapabilities.some(c => c.deviceCount === 0 && !existingCached?.assetBreakdown?.find(a => a.assetId === c.assetId)?.deviceEnrichmentAttempted),
  };
  
  // Recalculate sitesWithSolcast from the final breakdown (which may include preserved enriched data)
  cachedCapabilities.sitesWithSolcast = cachedCapabilities.assetBreakdown.filter(a => a.hasSolcast).length;

  // Determine if sync is complete
  const isComplete = finalCapabilities.length >= totalExpected;
  const syncStatus = isComplete ? 'synced' : 'partial';
  
  console.log(`[AMMP Sync Contract] Summary: ${cachedCapabilities.totalSites}/${totalExpected} sites, ${cachedCapabilities.totalMW.toFixed(4)} MW (status: ${syncStatus})`);
  
  return { 
    cachedCapabilities, 
    syncStatus, 
    timedOut, 
    totalExpected,
    previouslySynced: existingCapabilities.length,
    newlySynced: newCapabilities.length,
    previousSyncStatus: existingSyncStatus,
  };
}

/**
 * Detect and record asset status changes (appeared, disappeared, reappeared)
 */
async function detectAssetChanges(
  supabase: any,
  contractId: string,
  customerId: string,
  userId: string,
  currentAssets: Array<{ assetId: string; assetName: string; totalMW: number }>,
  previousCached: CachedCapabilities | null
): Promise<{ disappeared: number; appeared: number; reappeared: number }> {
  const now = new Date().toISOString();
  const currentAssetIds = new Set(currentAssets.map(a => a.assetId));
  const previousAssetIds = new Set(
    previousCached?.assetBreakdown?.map(a => a.assetId) || []
  );
  
  // Skip if this is the first sync (no previous data to compare)
  if (!previousCached?.assetBreakdown || previousCached.assetBreakdown.length === 0) {
    console.log(`[Asset Change Detection] First sync for contract ${contractId}, skipping change detection`);
    return { disappeared: 0, appeared: 0, reappeared: 0 };
  }
  
  const results = { disappeared: 0, appeared: 0, reappeared: 0 };
  
  // Find disappeared assets (were in previous, not in current)
  const disappearedAssets = previousCached.assetBreakdown.filter(
    a => !currentAssetIds.has(a.assetId)
  );
  
  // Find newly appeared assets (in current, not in previous)
  const appearedAssets = currentAssets.filter(
    a => !previousAssetIds.has(a.assetId)
  );
  
  console.log(`[Asset Change Detection] Contract ${contractId}: ${disappearedAssets.length} disappeared, ${appearedAssets.length} appeared`);
  
  // Record disappeared assets
  for (const asset of disappearedAssets) {
    try {
      await supabase
        .from('asset_status_history')
        .insert({
          contract_id: contractId,
          customer_id: customerId,
          user_id: userId,
          asset_id: asset.assetId,
          asset_name: asset.assetName,
          capacity_mw: asset.totalMW,
          status_change: 'disappeared',
          detected_at: now,
          previous_seen_at: previousCached.lastSynced || null,
          metadata: { previous_sync: previousCached.lastSynced },
        });
      results.disappeared++;
    } catch (err) {
      console.error(`[Asset Change Detection] Error recording disappeared asset ${asset.assetId}:`, err);
    }
  }
  
  // Check if appeared assets are actually "reappearing" (existed before, then disappeared)
  for (const asset of appearedAssets) {
    try {
      // Check history for previous disappearance
      const { data: lastDisappearance } = await supabase
        .from('asset_status_history')
        .select('*')
        .eq('contract_id', contractId)
        .eq('asset_id', asset.assetId)
        .eq('status_change', 'disappeared')
        .order('detected_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (lastDisappearance) {
        // This is a reappearance
        const disappearedAt = new Date(lastDisappearance.detected_at);
        const daysAbsent = Math.floor((new Date().getTime() - disappearedAt.getTime()) / (1000 * 60 * 60 * 24));
        
        await supabase
          .from('asset_status_history')
          .insert({
            contract_id: contractId,
            customer_id: customerId,
            user_id: userId,
            asset_id: asset.assetId,
            asset_name: asset.assetName,
            capacity_mw: asset.totalMW,
            status_change: 'reappeared',
            detected_at: now,
            previous_seen_at: lastDisappearance.detected_at,
            days_absent: daysAbsent,
            metadata: { 
              disappeared_at: lastDisappearance.detected_at,
              days_absent: daysAbsent,
            },
          });
        results.reappeared++;
        
        // Generate alert for suspicious reappearance (within 30 days)
        if (daysAbsent <= 30 && asset.totalMW >= 0.01) {
          await supabase
            .from('invoice_alerts')
            .insert({
              user_id: userId,
              contract_id: contractId,
              customer_id: customerId,
              alert_type: 'asset_reappeared_suspicious',
              severity: daysAbsent <= 7 ? 'critical' : 'warning',
              title: `Asset "${asset.assetName}" reappeared after ${daysAbsent} days`,
              description: `This asset disappeared and then reappeared within ${daysAbsent} days. This pattern may indicate manipulation around billing periods.`,
              metadata: {
                asset_id: asset.assetId,
                asset_name: asset.assetName,
                capacity_mw: asset.totalMW,
                days_absent: daysAbsent,
                disappeared_at: lastDisappearance.detected_at,
                reappeared_at: now,
              },
            });
          console.log(`[Asset Change Detection] Created suspicious reappearance alert for ${asset.assetName}`);
        }
      } else {
        // Truly new asset
        await supabase
          .from('asset_status_history')
          .insert({
            contract_id: contractId,
            customer_id: customerId,
            user_id: userId,
            asset_id: asset.assetId,
            asset_name: asset.assetName,
            capacity_mw: asset.totalMW,
            status_change: 'appeared',
            detected_at: now,
            metadata: { first_appearance: true },
          });
        results.appeared++;
      }
    } catch (err) {
      console.error(`[Asset Change Detection] Error recording appeared asset ${asset.assetId}:`, err);
    }
  }
  
  console.log(`[Asset Change Detection] Recorded: ${results.disappeared} disappeared, ${results.appeared} new, ${results.reappeared} reappeared`);
  return results;
}

/**
 * Populate site_billing_status for per_site contracts
 */
async function populateSiteBillingStatus(
  supabase: any,
  contractId: string,
  customerId: string,
  userId: string,
  assetBreakdown: Array<{
    assetId: string;
    assetName: string;
    totalMW: number;
    onboardingDate?: string | null;
  }>
) {
  // Check if this is a per_site contract
  const { data: contract } = await supabase
    .from('contracts')
    .select('package, onboarding_fee_per_site, annual_fee_per_site')
    .eq('id', contractId)
    .single();
  
  if (!contract || contract.package !== 'per_site') return;
  
  console.log(`[AMMP Sync Contract] Populating site_billing_status for ${assetBreakdown.length} assets`);
  
  for (const asset of assetBreakdown) {
    const { data: existing } = await supabase
      .from('site_billing_status')
      .select('id, onboarding_fee_paid')
      .eq('asset_id', asset.assetId)
      .eq('contract_id', contractId)
      .maybeSingle();
    
    if (existing) {
      await supabase
        .from('site_billing_status')
        .update({
          asset_name: asset.assetName,
          asset_capacity_kwp: asset.totalMW * 1000,
          ...(asset.onboardingDate ? { onboarding_date: asset.onboardingDate } : {}),
        })
        .eq('id', existing.id);
    } else {
      const onboardingDate = asset.onboardingDate ? new Date(asset.onboardingDate) : new Date();
      const nextAnnualDue = new Date(onboardingDate);
      nextAnnualDue.setFullYear(nextAnnualDue.getFullYear() + 1);
      
      await supabase
        .from('site_billing_status')
        .insert({
          user_id: userId,
          contract_id: contractId,
          customer_id: customerId,
          asset_id: asset.assetId,
          asset_name: asset.assetName,
          asset_capacity_kwp: asset.totalMW * 1000,
          onboarding_date: onboardingDate.toISOString(),
          onboarding_fee_paid: false,
          next_annual_due_date: nextAnnualDue.toISOString(),
        });
    }
  }
}

/**
 * Elum 2026: surface org-resolution problems as alerts on the Alerts page.
 * Each condition is inserted only when no matching unacknowledged alert already
 * exists for this contract, so repeated syncs don't pile up duplicates.
 */
async function generateElumAlerts(
  supabase: any,
  contractId: string,
  customerId: string,
  userId: string,
  contractLabel: string,
  cached: CachedCapabilities,
  previous?: CachedCapabilities | null
) {
  const orgBreakdown = cached.orgBreakdown || [];
  const previousSites = previous?.totalSites || 0;
  const currentSites = cached.totalSites || 0;
  const siteDrop = previousSites - currentSites;
  const significantDrop = previousSites >= 5 && siteDrop > 0 && siteDrop / previousSites >= 0.1;

  if (orgBreakdown.length === 0 && !(cached.unassignedOrgs?.length) && !(cached.tierConflictOrgs?.length) && !significantDrop) return;


  type PendingAlert = {
    alert_type: string;
    severity: 'critical' | 'warning' | 'info';
    title: string;
    description: string;
    metadata: Record<string, unknown>;
  };
  const pending: PendingAlert[] = [];

  // 0. Site count dropped materially since the previous sync
  if (significantDrop) {
    pending.push({
      alert_type: 'ammp_site_count_drop',
      severity: 'critical',
      title: `Site count dropped from ${previousSites} to ${currentSites}`,
      description: `The last AMMP sync resolved ${siteDrop} fewer site${siteDrop === 1 ? '' : 's'} than the previous sync. Verify the org tier flags and asset group membership before invoicing.`,
      metadata: { contract: contractLabel, previousSites, currentSites, drop: siteDrop },
    });
  }


  // 1. Sub-orgs with no tier flag -> check whether their assets are still
  // covered by the legacy asset group before treating them as leakage
  const unassigned = cached.unassignedOrgs || [];
  if (unassigned.length > 0) {
    const strandedAssets = unassigned.reduce((s: number, o: any) => s + (o.assetCount || 0), 0);
    const strandedMW = unassigned.reduce((s: number, o: any) => s + (o.totalMW || 0), 0);
    const uncovered = unassigned.reduce((s: number, o: any) => s + (o.uncovered || 0), 0);
    const uncoveredMW = unassigned.reduce((s: number, o: any) => s + (o.uncoveredMW || 0), 0);
    const coveredStandard = unassigned.reduce((s: number, o: any) => s + (o.coveredStandard || 0), 0);
    const coveredEconf = unassigned.reduce((s: number, o: any) => s + (o.coveredEconf || 0), 0);
    const coveredElsewhere = unassigned.reduce((s: number, o: any) => s + (o.coveredElsewhere || 0), 0);
    const anyPartial = unassigned.some((o: any) => o.partial);
    const covered = coveredStandard + coveredEconf + coveredElsewhere;
    const elsewhereNote = coveredElsewhere > 0
      ? ` ${coveredElsewhere} asset${coveredElsewhere === 1 ? ' is' : 's are'} billed through another Elum tier's asset group.`
      : '';
    const impact = uncovered > 0
      ? ` ${uncovered} asset${uncovered === 1 ? '' : 's'} (${uncoveredMW.toFixed(2)} MWp) are in no tier org and in no Elum tier asset group.${elsewhereNote}`
      : anyPartial
        ? ` Coverage against the Elum tier asset groups could not be verified (sync was truncated).`
        : ` All ${covered} of their assets are still priced through an Elum tier asset group.${elsewhereNote}`;
    pending.push({
      alert_type: 'elum_org_unassigned',
      severity: uncovered > 0 ? 'critical' : 'info',
      title: uncovered > 0
        ? `${uncovered} Elum asset${uncovered === 1 ? '' : 's'} not covered by any tier or legacy group`
        : `${unassigned.length} Elum sub-org${unassigned.length === 1 ? '' : 's'} without a tier flag (all covered)`,
      description: `These sub-orgs have no epm_lite / epm_pro / epm_utility / elum_internal / epm_internal feature flag: ${unassigned.map((o: any) => `${o.orgName || o.orgId}${o.assetCount ? ` (${o.assetCount})` : ''}`).join(', ')}.${impact}`,
      metadata: { contract: contractLabel, orgs: unassigned, strandedAssets, strandedMW, uncovered, uncoveredMW, coveredStandard, coveredEconf, coveredElsewhere },

    });
  }

  // 1b. Sub-orgs carrying 2+ conflicting billing tier flags. Internal combos are
  // resolved silently (internal wins) and remote_econf is a normal add-on.
  const conflicts = cached.tierConflictOrgs || [];
  if (conflicts.length > 0) {
    pending.push({
      alert_type: 'elum_org_tier_conflict',
      severity: 'warning',
      title: `${conflicts.length} Elum sub-org${conflicts.length === 1 ? '' : 's'} with conflicting billing tier flags`,
      description: `These sub-orgs carry more than one billing tier flag, so the tier used for pricing is ambiguous: ${conflicts.map(o => `${o.orgName || o.orgId} (${o.tiers.join(' + ')})`).join(', ')}. Remove the extra flag in AMMP so each org has exactly one tier.`,
      metadata: { contract: contractLabel, orgs: conflicts },
    });
  }




  // 2. Assets present in both a sub-org and the legacy asset group
  const doubleCounted = cached.doubleCountWarnings || [];
  if (doubleCounted.length > 0) {
    pending.push({
      alert_type: 'elum_asset_double_count',
      severity: 'warning',
      title: `${doubleCounted.length} asset${doubleCounted.length === 1 ? '' : 's'} in both a sub-org and the legacy asset group`,
      description: `These assets were counted once (sub-org wins) during the transition: ${doubleCounted.slice(0, 10).map((a: any) => a.assetName).join(', ')}${doubleCounted.length > 10 ? ', …' : ''}. Remove them from the legacy asset group once the migration is complete.`,
      metadata: { contract: contractLabel, assets: doubleCounted },
    });
  }

  // 3. Utility orgs containing sites below 2 MWp -> blended rate is invalid
  const utilityViolations: Array<{ orgName: string; assetName: string; totalMW: number }> = [];
  orgBreakdown
    .filter((o: any) => o.tier === 'utility')
    .forEach((org: any) => {
      (org.assets || []).forEach((a: any) => {
        if ((a.totalMW || 0) < 2) {
          utilityViolations.push({ orgName: org.orgName, assetName: a.assetName, totalMW: a.totalMW });
        }
      });
    });
  if (utilityViolations.length > 0) {
    pending.push({
      alert_type: 'elum_utility_site_too_small',
      severity: 'critical',
      title: `${utilityViolations.length} Utility site${utilityViolations.length === 1 ? '' : 's'} below 2 MWp`,
      description: `Utility pricing requires every site above 2 MWp. Invoicing is blocked until these are re-tiered or flagged as MWh overrides: ${utilityViolations.slice(0, 10).map((v) => `${v.assetName} (${v.totalMW?.toFixed(2)} MW, ${v.orgName})`).join(', ')}${utilityViolations.length > 10 ? ', …' : ''}.`,
      metadata: { contract: contractLabel, sites: utilityViolations },
    });
  }

  for (const alert of pending) {
    const { data: existing } = await supabase
      .from('invoice_alerts')
      .select('id')
      .eq('contract_id', contractId)
      .eq('alert_type', alert.alert_type)
      .eq('is_acknowledged', false)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const { error } = await supabase.from('invoice_alerts').insert({
      user_id: userId,
      contract_id: contractId,
      customer_id: customerId,
      ...alert,
    });
    if (error) {
      console.error(`[Elum Alerts] Failed to insert ${alert.alert_type}: ${error.message}`);
    } else {
      console.log(`[Elum Alerts] Created ${alert.alert_type} for contract ${contractId}`);
    }
  }
}


Deno.serve(async (req) => {
  requestDeadline = Date.now() + REQUEST_BUDGET_MS;
  discoveryDeadline = requestDeadline - ASSET_LOOP_RESERVE_MS;
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  let contractIdForError: string | null = null;

  try {
    const { contractId, apiKey, userId } = await req.json();
    contractIdForError = contractId ?? null;

    if (!contractId) {
      return new Response(
        JSON.stringify({ error: 'contractId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { effectiveUserId } = await resolveAuthorizedUser(req, supabase, serviceKey, userId);

    console.log(`[AMMP Sync Contract] Starting sync for contract ${contractId}`);

    // Fetch the contract with customer info - now uses contract.ammp_org_id
    const { data: contract, error: contractError } = await supabase
      .from('contracts')
      .select(`
        id,
        customer_id,
        package,
        company_name,
        contract_name,
        ammp_org_id,
        ammp_asset_group_id,
        ammp_asset_group_id_and,
        ammp_asset_group_id_not,
        elum_tier,
        elum_parent_org_id,
        org_pricing_config,
        cached_capabilities,
        ammp_sync_status,
        customers!inner (
          id,
          ammp_org_id
        )
      `)
      .eq('id', contractId)
      .single();

    if (contractError || !contract) {
      throw new Error(`Contract not found: ${contractError?.message}`);
    }

    // Skip POC contracts
    if (contract.package === 'poc') {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'POC contracts do not need AMMP sync',
          totalSites: 0,
          totalMW: 0
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if contract has org ID (either on contract or customer)
    const orgId = contract.ammp_org_id || (contract.customers as any)?.ammp_org_id;
    
    const hasElumOrgTier = !!(contract as any).elum_tier && !!(contract as any).elum_parent_org_id;
    if (!orgId && !contract.ammp_asset_group_id && !hasElumOrgTier) {

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Contract has no AMMP org ID or asset group configured'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get API key from connection if not provided
    let token: string;
    if (apiKey) {
      token = await getToken(apiKey);
    } else {
      const sharedApiKey = await getSharedAmmpApiKey(supabase);
      token = await getToken(sharedApiKey);
    }

    // Fetch all assets (we'll filter by group/org in processContractSync)
    const allAssets = await fetchAMMPData(token, '/assets');
    console.log(`[AMMP Sync Contract] Fetched ${allAssets.length} total assets`);
    
    // Build lookup map for O(1) asset access - eliminates redundant per-asset API calls
    const assetLookup = new Map<string, any>(allAssets.map((a: any) => [a.asset_id as string, a]));

    // Store previous cached capabilities for change detection
    const previousCached = contract.cached_capabilities as CachedCapabilities | null;
    
    // Process the contract with the pre-built lookup map
    const syncResult = await processContractSync(supabase, contract, token, allAssets, assetLookup);
    const { cachedCapabilities, syncStatus, timedOut, totalExpected, previouslySynced, newlySynced, previousSyncStatus } = syncResult;

    // Safety guard: never wipe a previously populated cache with an empty result.
    // A transient AMMP/org-endpoint failure would otherwise zero out the portfolio.
    const previousAssetCount = previousCached?.assetBreakdown?.length || 0;
    if (cachedCapabilities.assetBreakdown.length === 0 && previousAssetCount > 0) {
      console.error(`[AMMP Sync Contract] Aborting update: sync returned 0 assets but ${previousAssetCount} were cached. Keeping previous cache.`);

      // The cache is preserved, but the attempt must still be recorded — otherwise
      // the run is invisible and `last_ammp_sync` looks like the sync never fired.
      const abortReason = 'Sync resolved 0 assets while previous cache had assets — previous data kept. Check the AMMP org / asset-group configuration.';
      await supabase
        .from('contracts')
        .update({
          ammp_sync_status: 'partial',
          last_ammp_sync: new Date().toISOString(),
          cached_capabilities: {
            ...(previousCached || {}),
            lastSyncAttempt: {
              at: new Date().toISOString(),
              outcome: 'aborted_empty',
              reason: abortReason,
              resolvedAssets: 0,
              previousAssetCount,
              orgsResolved: cachedCapabilities.orgBreakdown?.length || 0,
              timedOut: timedOut || false,
            },
          },
        })
        .eq('id', contractId);

      return new Response(
        JSON.stringify({
          success: false,
          error: abortReason,
          contractId,
          previousAssetCount,
        }),
        { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }


    // Update the contract with cached capabilities and sync status
    const { error: updateError } = await supabase
      .from('contracts')
      .update({ 
        cached_capabilities: cachedCapabilities,
        ammp_sync_status: syncStatus,
        last_ammp_sync: new Date().toISOString(),
        ammp_asset_ids: cachedCapabilities.assetBreakdown.map((a: any) => a.assetId)
      })
      .eq('id', contractId);

    if (updateError) {
      throw new Error(`Failed to update contract: ${updateError.message}`);
    }

    // Detect and record asset status changes (appeared, disappeared, reappeared)
    // Only run when BOTH the previous and the current sync are complete — a partial
    // run holds only a subset of the assets and would flag the rest as disappeared.
    let assetChanges = { disappeared: 0, appeared: 0, reappeared: 0 };
    
    if (previousSyncStatus !== 'partial' && syncStatus !== 'partial') {
      assetChanges = await detectAssetChanges(
        supabase,
        contractId,
        contract.customer_id,
        effectiveUserId,
        cachedCapabilities.assetBreakdown.map((a: any) => ({
          assetId: a.assetId,
          assetName: a.assetName,
          totalMW: a.totalMW,
        })),
        previousCached
      );
    } else {
      console.log(`[Asset Change Detection] Skipping - sync incomplete (previous: ${previousSyncStatus}, current: ${syncStatus}), no reliable baseline`);
    }

    // Elum 2026: raise alerts for org-resolution problems
    await generateElumAlerts(
      supabase,
      contractId,
      contract.customer_id,
      effectiveUserId,
      contract.contract_name || contract.company_name || 'Contract',
      cachedCapabilities,
      previousCached
    );


    // Zero-PV scan for this contract (monthly cron is the backstop)
    try {
      const zeroPv = await runZeroPvScan(supabase, { contractId });
      console.log(`[Zero PV] Scan for ${contractId}:`, JSON.stringify(zeroPv));
    } catch (zeroPvErr) {
      console.error('[Zero PV] Scan failed:', zeroPvErr);
    }




    // Populate site billing status for per_site contracts
    await populateSiteBillingStatus(
      supabase,
      contractId,
      contract.customer_id,
      effectiveUserId,
      cachedCapabilities.assetBreakdown
    );

    // Update customer's mwp_managed (aggregate from all contracts)
    const { data: customerContracts } = await supabase
      .from('contracts')
      .select('cached_capabilities')
      .eq('customer_id', contract.customer_id)
      .eq('contract_status', 'active')
      .neq('package', 'poc');
    
    const totalCustomerMW = customerContracts?.reduce((sum: number, c: any) => {
      return sum + (c.cached_capabilities?.totalMW || 0);
    }, 0) || 0;
    
    await supabase
      .from('customers')
      .update({ mwp_managed: totalCustomerMW })
      .eq('id', contract.customer_id);

    console.log(`[AMMP Sync Contract] Successfully synced contract ${contractId} (status: ${syncStatus})`);

    const responseData = { 
      success: true,
      contractId,
      totalSites: cachedCapabilities.totalSites,
      totalMW: cachedCapabilities.totalMW,
      lastSynced: cachedCapabilities.lastSynced,
      syncStatus,
      timedOut,
      totalExpected,
      previouslySynced,
      newlySynced,
      assetChanges,
      message: timedOut 
        ? `Partial sync: ${cachedCapabilities.totalSites}/${totalExpected} assets (${newlySynced} new this run)`
        : previouslySynced > 0 
          ? `Sync complete: resumed from ${previouslySynced} existing assets, added ${newlySynced} new`
          : undefined
    };

    // AUTO-CONTINUATION: If sync is partial, continue in background until complete
    if (syncStatus === 'partial' && typeof EdgeRuntime !== 'undefined') {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      EdgeRuntime.waitUntil((async () => {
        const MAX_CONTINUATION_ATTEMPTS = 5;
        let attempt = 0;
        let currentStatus: string = 'partial';
        
        console.log(`[AMMP Sync Contract] Starting auto-continuation for ${contractId} (${cachedCapabilities.totalSites}/${totalExpected} synced)`);
        
        while (currentStatus === 'partial' && attempt < MAX_CONTINUATION_ATTEMPTS) {
          attempt++;
          console.log(`[AMMP Sync Contract] Auto-continuation attempt ${attempt}/${MAX_CONTINUATION_ATTEMPTS}`);
          
          // Brief pause between attempts (API rate limiting)
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            // Re-invoke sync (will resume from cached state)
            const result = await fetch(`${supabaseUrl}/functions/v1/ammp-sync-contract`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ contractId, apiKey, userId: effectiveUserId }),
            });
            
            const data = await result.json();
            currentStatus = data.syncStatus || 'synced';
            
            console.log(`[AMMP Sync Contract] Continuation ${attempt}: status=${currentStatus}, sites=${data.totalSites}/${data.totalExpected}`);
            
            if (currentStatus === 'synced') {
              console.log(`[AMMP Sync Contract] Auto-continuation complete after ${attempt} attempt(s)`);
              
              // Create completion notification
              await supabase.from('notifications').insert({
                user_id: effectiveUserId,
                contract_id: contractId,
                type: 'ammp_sync_complete',
                title: 'Large Sync Complete',
                message: `Contract fully synced after ${attempt} continuation(s): ${data.totalSites} sites, ${data.totalMW?.toFixed(2)} MW`,
                severity: 'info',
                metadata: { 
                  contractId, 
                  totalSites: data.totalSites, 
                  totalMW: data.totalMW,
                  continuationAttempts: attempt,
                },
              });
              
              // AUTO-RUN DEVICE ENRICHMENT after sync completes
              console.log(`[AMMP Sync Contract] Starting auto device enrichment for ${contractId}`);
              
              let enrichmentComplete = false;
              let enrichAttempt = 0;
              const MAX_ENRICHMENT_ATTEMPTS = 15; // 15 batches × 50 assets = 750 assets
              
              while (!enrichmentComplete && enrichAttempt < MAX_ENRICHMENT_ATTEMPTS) {
                enrichAttempt++;
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                try {
                  const enrichResult = await fetch(`${supabaseUrl}/functions/v1/ammp-device-enrichment`, {
                    method: 'POST',
                    headers: {
                      'Content-Type': 'application/json',
                      'Authorization': `Bearer ${serviceKey}`,
                    },
                    body: JSON.stringify({ contractId, batchSize: 500 }),
                  });
                  
                  const enrichData = await enrichResult.json();
                  enrichmentComplete = enrichData.complete === true;
                  
                  console.log(`[AMMP Sync Contract] Enrichment batch ${enrichAttempt}: ${enrichData.enriched || 0} processed, complete=${enrichmentComplete}`);
                } catch (enrichError) {
                  console.error(`[AMMP Sync Contract] Enrichment batch ${enrichAttempt} failed:`, enrichError);
                  break;
                }
              }
              
              if (enrichmentComplete) {
                console.log(`[AMMP Sync Contract] Device enrichment complete for ${contractId}`);
              }
            }
          } catch (contError) {
            console.error(`[AMMP Sync Contract] Continuation ${attempt} failed:`, contError);
            break;
          }
        }
        
        if (currentStatus === 'partial') {
          console.warn(`[AMMP Sync Contract] Auto-continuation stopped after ${MAX_CONTINUATION_ATTEMPTS} attempts, status still partial`);
        }
      })());
    } else if (syncStatus === 'synced' && cachedCapabilities.needsDeviceEnrichment && typeof EdgeRuntime !== 'undefined') {
      // If sync completed but needs device enrichment, run it in background
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      
      EdgeRuntime.waitUntil((async () => {
        console.log(`[AMMP Sync Contract] Starting background device enrichment for ${contractId}`);
        
        let enrichmentComplete = false;
        let enrichAttempt = 0;
        const MAX_ENRICHMENT_ATTEMPTS = 15;
        
        while (!enrichmentComplete && enrichAttempt < MAX_ENRICHMENT_ATTEMPTS) {
          enrichAttempt++;
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          try {
            const enrichResult = await fetch(`${supabaseUrl}/functions/v1/ammp-device-enrichment`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({ contractId, batchSize: 500 }),
            });
            
            const enrichData = await enrichResult.json();
            enrichmentComplete = enrichData.complete === true;
            
            console.log(`[AMMP Sync Contract] Enrichment batch ${enrichAttempt}: ${enrichData.enriched || 0} processed, complete=${enrichmentComplete}`);
          } catch (enrichError) {
            console.error(`[AMMP Sync Contract] Enrichment batch ${enrichAttempt} failed:`, enrichError);
            break;
          }
        }
        
        if (enrichmentComplete) {
          console.log(`[AMMP Sync Contract] Device enrichment complete for ${contractId}`);
        }
      })());
    }

    return new Response(
      JSON.stringify(responseData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[AMMP Sync Contract] Error:', error);

    // Mark the contract as errored, leaving cached_capabilities untouched so a
    // failed lookup never silently drops previously resolved sites.
    if (contractIdForError) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        await supabaseAdmin
          .from('contracts')
          .update({ ammp_sync_status: 'error' })
          .eq('id', contractIdForError);
      } catch (statusErr) {
        console.error('[AMMP Sync Contract] Failed to mark contract as errored:', statusErr);
      }
    }

    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

});
