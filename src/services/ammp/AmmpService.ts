import { dataApiClient } from './DataApiClient'
import type {
  UUID,
  AssetCapabilities,
  CustomerAMMPSummary,
  DeviceResponse
} from '@/types/ammp-api'

export class AmmpService {
  // Analyze device capabilities for a single asset
  async analyzeAssetCapabilities(assetId: UUID): Promise<AssetCapabilities> {
    const assetWithDevices = await dataApiClient.getDevices(assetId)
    const devices = assetWithDevices.devices || []

    const capabilities: AssetCapabilities = {
      assetId: assetWithDevices.asset_id,
      assetName: assetWithDevices.asset_name,
      totalMW: (assetWithDevices.total_pv_power || 0) / 1_000_000,
      hasSolcast: this.detectSolcast(devices),
      hasBattery: this.detectBattery(devices),
      hasGenset: this.detectGenset(devices),
      onboardingDate: null, // Will be fetched separately
      deviceCount: devices.length,
      devices
    }

    return capabilities
  }

  // Detect Solcast satellite data
  private detectSolcast(devices: DeviceResponse[]): boolean {
    return devices.some(d => {
      // Check data_provider field
      if (d.data_provider?.toLowerCase().includes('solcast')) return true
      // Check device name
      if (d.device_name?.toLowerCase().includes('solcast')) return true
      // Check links for solcast endpoints
      if (d.links?.some(link => link.href.toLowerCase().includes('solcast'))) return true
      return false
    })
  }

  // Detect battery storage
  private detectBattery(devices: DeviceResponse[]): boolean {
    return devices.some(d => {
      const type = d.device_type?.toLowerCase() || ''
      const modelName = d.device_model_name?.toLowerCase() || ''
      return type.includes('battery') || 
             modelName.includes('battery') ||
             type === 'battery_system' ||
             type === 'battery_inverter'
    })
  }

  // Detect genset
  private detectGenset(devices: DeviceResponse[]): boolean {
    return devices.some(d => {
      const type = d.device_type?.toLowerCase() || ''
      const modelName = d.device_model_name?.toLowerCase() || ''
      return type.includes('genset') || 
             type.includes('generator') ||
             type.includes('gen') ||
             type === 'fuel_sensor' ||
             modelName.includes('fuel') ||
             modelName.includes('genset')
    })
  }

  // Get onboarding date (earliest data date)
  async getOnboardingDate(assetId: UUID): Promise<string | null> {
    try {
      const today = new Date().toISOString().split('T')[0]
      
      const response = await dataApiClient.bulkRequestAssetData('historic-energy', {
        asset_ids: [assetId],
        interval: '1d',
        date_from: '2020-01-01',
        date_to: today
      })

      if (!response[0]?.pv_energy_out?.data?.length) {
        return null
      }

      // Find earliest non-zero data point
      const datapoints = response[0].pv_energy_out.data
        .filter(dp => dp.value !== null && dp.value > 0)
        .sort((a, b) => a.date.localeCompare(b.date))

      return datapoints[0]?.date || null
    } catch (error) {
      console.error(`Error fetching onboarding date for ${assetId}:`, error)
      return null
    }
  }

  // Get full customer summary
  async getCustomerSummary(assetIds: UUID[]): Promise<CustomerAMMPSummary> {
    if (assetIds.length === 0) {
      return this.getEmptySummary()
    }

    // Fetch capabilities for all assets in parallel
    const capabilitiesPromises = assetIds.map(id => 
      this.analyzeAssetCapabilities(id)
    )

    const capabilities = await Promise.all(capabilitiesPromises)

    // Fetch onboarding dates in parallel
    const onboardingPromises = assetIds.map(id => 
      this.getOnboardingDate(id)
    )
    const onboardingDates = await Promise.all(onboardingPromises)

    // Merge onboarding dates into capabilities
    capabilities.forEach((cap, i) => {
      cap.onboardingDate = onboardingDates[i]
    })

    // Build capabilities map
    const capabilitiesMap: Record<UUID, AssetCapabilities> = {}
    capabilities.forEach(cap => {
      capabilitiesMap[cap.assetId] = cap
    })

    // Calculate summary
    const summary: CustomerAMMPSummary = {
      totalMW: capabilities.reduce((sum, c) => sum + c.totalMW, 0),
      totalSites: capabilities.length,
      sitesWithSolcast: capabilities.filter(c => c.hasSolcast).length,
      sitesWithBattery: capabilities.filter(c => c.hasBattery).length,
      sitesWithGenset: capabilities.filter(c => c.hasGenset).length,
      earliestOnboardingDate: this.findEarliestDate(onboardingDates),
      assetCapabilities: capabilitiesMap
    }

    return summary
  }

  // Helper: find earliest date
  private findEarliestDate(dates: (string | null)[]): string | null {
    const validDates = dates.filter(d => d !== null) as string[]
    if (validDates.length === 0) return null
    return validDates.sort((a, b) => a.localeCompare(b))[0]
  }

  // Helper: empty summary
  private getEmptySummary(): CustomerAMMPSummary {
    return {
      totalMW: 0,
      totalSites: 0,
      sitesWithSolcast: 0,
      sitesWithBattery: 0,
      sitesWithGenset: 0,
      earliestOnboardingDate: null,
      assetCapabilities: {}
    }
  }
}

// Singleton instance
export const ammpService = new AmmpService()
