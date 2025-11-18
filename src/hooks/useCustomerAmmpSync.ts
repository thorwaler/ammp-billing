import { useState } from 'react'
import { supabase } from '@/integrations/supabase/client'
import { ammpService } from '@/services/ammp/AmmpService'
import type { UUID, CustomerAMMPSummary } from '@/types/ammp-api'
import { toast } from '@/hooks/use-toast'

export function useCustomerAmmpSync() {
  const [isSyncing, setIsSyncing] = useState(false)

  // Sync single customer
  const syncCustomer = async (customerId: string): Promise<CustomerAMMPSummary | null> => {
    setIsSyncing(true)

    try {
      // Fetch customer data
      const { data: customer, error: fetchError } = await supabase
        .from('customers')
        .select('ammp_asset_ids')
        .eq('id', customerId)
        .single()

      if (fetchError) throw fetchError

      const assetIds = (customer.ammp_asset_ids as UUID[]) || []

      if (assetIds.length === 0) {
        toast({
          title: 'No AMMP Assets',
          description: 'This customer has no linked AMMP assets',
          variant: 'destructive',
        })
        return null
      }

      // Fetch AMMP data
      const summary = await ammpService.getCustomerSummary(assetIds)

      // Update database
      const { error: updateError } = await supabase
        .from('customers')
        .update({
          mwp_managed: summary.totalMW,
          ammp_capabilities: summary.assetCapabilities as any,
          last_ammp_sync: new Date().toISOString(),
          ammp_sync_status: 'success'
        })
        .eq('id', customerId)

      if (updateError) throw updateError

      toast({
        title: 'Sync Complete',
        description: `Updated MW: ${summary.totalMW.toFixed(2)}, Sites: ${summary.totalSites}`,
      })

      return summary
    } catch (error: any) {
      console.error('Sync error:', error)
      
      // Mark as error in DB
      await supabase
        .from('customers')
        .update({ ammp_sync_status: 'error' })
        .eq('id', customerId)

      toast({
        title: 'Sync Failed',
        description: error.message || 'Failed to sync AMMP data',
        variant: 'destructive',
      })

      return null
    } finally {
      setIsSyncing(false)
    }
  }

  return { syncCustomer, isSyncing }
}
