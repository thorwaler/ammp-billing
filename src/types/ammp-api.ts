export type UUID = string & { __brand?: "uuid" }
export type DateStr = string & { __brand?: "date" }
export type DateTimeStr = string & { __brand?: "datetime" }

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
}

// Device metadata
export interface DeviceResponse {
  device_id: UUID
  device_name: string
  device_type: string  // "inverter", "battery", "genset", "meter"
  manufacturer?: string
  model?: string
  data_provider?: string  // "solcast", "sma", "huawei", etc.
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
