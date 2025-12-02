export type UUID = string & { __brand?: "uuid" }
export type DateStr = string & { __brand?: "date" }
export type DateTimeStr = string & { __brand?: "datetime" }

// Asset tags
export interface AssetTags {
  state?: string | null
  portal?: string | null
  product?: string | null
  customer?: string | null
  hub_name?: string | null
  site_ref?: string | null
  hs_box_id?: string | null
  serial_no?: string | null
  site_name?: string | null
  client_name?: string | null
  hs_box_type?: string | null
  customer_segment?: string | null
  human_settlement?: string | null
  inverter_cluster?: string | null
  field_service_engineer?: string | null
}

// Device links
export interface DeviceLink {
  rel: string
  title: string
  href: string
}

// Asset metadata
export interface AssetResponse {
  asset_id: UUID
  asset_name: string
  long_name?: string
  latitude?: number
  longitude?: number
  country_code?: string
  region?: string
  place?: string
  total_pv_power?: number  // Watts (divide by 1M for MW)
  co2_offset_factor?: number
  modeled_loss?: number
  warnings?: string[]
  tags?: AssetTags
  org_id?: UUID
  beta?: number | null
  tref?: number | null
  asset_specific_params?: any
  expected_pr?: number | null
  devices?: DeviceResponse[]  // Nested devices when fetching /assets/{id}/devices
  created?: string  // Asset creation date from AMMP API (e.g., "2022-08-29T14:39:50.093000")
  grid_type?: string
  asset_timezone?: string
  num_phases?: number | null
}

// Device metadata
export interface DeviceResponse {
  device_id: UUID
  device_name: string
  device_type?: string  // "pv_inverter", "battery_system", "battery_inverter", "fuel_sensor", "temperature_sensor"
  serial_no?: string | null
  device_model_name?: string  // e.g., "battery_inverter - Victron"
  manufacturer?: string
  model?: string
  data_provider?: string  // "solcast", "sma", "huawei", etc.
  links?: DeviceLink[]
}

// Device capabilities (derived)
export interface AssetCapabilities {
  assetId: UUID
  assetName: string
  totalMW: number
  hasSolcast: boolean
  hasBattery: boolean
  hasGenset: boolean
  onboardingDate: string | null
  deviceCount: number
  devices: DeviceResponse[]
}

// Timeseries data
export interface Datapoint<T = number> {
  date: DateStr | DateTimeStr
  value: T
}

export interface TimeseriesField {
  interval: string
  data: Datapoint[]
  unit: string
  data_provider?: string[]
}

export interface AssetDataResponse extends AssetResponse {
  pv_energy_out?: TimeseriesField
  battery_energy_in?: TimeseriesField
  battery_energy_out?: TimeseriesField
  genset_energy_out?: TimeseriesField
  [key: string]: any
}

// API Request types
export interface AssetBulkDataRequestBody {
  asset_ids: UUID[]
  interval: "15m" | "1h" | "1d" | "1M"
  date_from: DateStr | DateTimeStr
  date_to: DateStr | DateTimeStr
}

// Customer summary (aggregated)
export interface CustomerAMMPSummary {
  totalMW: number
  totalSites: number
  sitesWithSolcast: number
  sitesWithBattery: number
  sitesWithGenset: number
  earliestOnboardingDate: string | null
  assetCapabilities: Record<UUID, AssetCapabilities>
}

// Extended summary for hybrid/ongrid breakdown
export interface CustomerAMMPSummaryExtended {
  totalMW: number
  ongridTotalMW: number
  hybridTotalMW: number
  totalSites: number
  ongridSites: number
  hybridSites: number
  sitesWithSolcast: number
  assetBreakdown: Array<{
    assetId: UUID
    assetName: string
    totalMW: number
    isHybrid: boolean
    hasSolcast: boolean
    deviceCount: number
    onboardingDate: string | null  // Asset creation date from AMMP
  }>
}

// Sync anomaly detection
export interface SyncAnomalies {
  hasAnomalies: boolean
  warnings: string[]
  stats: {
    totalAssets: number
    assetsWithNoDevices: number
    assetsWithDevices: number
    percentageWithNoDevices: number
  }
}

// Error class
export class DataApiRequestError extends Error {
  constructor(
    message: string,
    public url: string,
    public options: RequestInit,
    public status?: number,
    public responseBody?: any
  ) {
    super(message)
    this.name = 'DataApiRequestError'
  }
}
