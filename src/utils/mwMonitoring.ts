import { supabase } from '@/integrations/supabase/client';

export interface MWCheckResult {
  exceeds: boolean;
  currentMW: number;
  maxMW: number;
  percentageUsed: number;
}

export const checkMWExceeded = async (contractId: string, currentMW: number): Promise<MWCheckResult | null> => {
  try {
    const { data: contract, error } = await supabase
      .from('contracts')
      .select('max_mw, package, company_name')
      .eq('id', contractId)
      .single();

    if (error) throw error;
    if (!contract) return null;

    // Only check for capped packages
    if (contract.package !== 'capped' || !contract.max_mw) {
      return null;
    }

    const maxMW = Number(contract.max_mw);
    const percentageUsed = (currentMW / maxMW) * 100;
    const exceeds = currentMW > maxMW;

    return {
      exceeds,
      currentMW,
      maxMW,
      percentageUsed,
    };
  } catch (error) {
    console.error('Error checking MW exceeded:', error);
    return null;
  }
};

export const createMWExceededNotification = async (
  userId: string,
  contractId: string,
  customerName: string,
  currentMW: number,
  maxMW: number
) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        contract_id: contractId,
        type: 'mw_exceeded',
        title: 'MW Capacity Exceeded',
        message: `${customerName} has exceeded the MW cap. Current: ${currentMW.toFixed(2)} MW, Cap: ${maxMW.toFixed(2)} MW`,
        severity: 'warning',
        metadata: {
          currentMW,
          maxMW,
          customerName,
          exceededBy: currentMW - maxMW,
        },
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating MW exceeded notification:', error);
  }
};

export const createMWWarningNotification = async (
  userId: string,
  contractId: string,
  customerName: string,
  currentMW: number,
  maxMW: number,
  percentageUsed: number
) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        contract_id: contractId,
        type: 'mw_warning',
        title: 'MW Capacity Warning',
        message: `${customerName} is approaching the MW cap at ${percentageUsed.toFixed(0)}%. Current: ${currentMW.toFixed(2)} MW, Cap: ${maxMW.toFixed(2)} MW`,
        severity: 'info',
        metadata: {
          currentMW,
          maxMW,
          customerName,
          percentageUsed,
        },
      });

    if (error) throw error;
  } catch (error) {
    console.error('Error creating MW warning notification:', error);
  }
};

export const monitorMWAndNotify = async (
  userId: string,
  contractId: string,
  customerName: string,
  currentMW: number
) => {
  const result = await checkMWExceeded(contractId, currentMW);
  
  if (!result) return;

  if (result.exceeds) {
    await createMWExceededNotification(
      userId,
      contractId,
      customerName,
      result.currentMW,
      result.maxMW
    );
  } else if (result.percentageUsed >= 80) {
    await createMWWarningNotification(
      userId,
      contractId,
      customerName,
      result.currentMW,
      result.maxMW,
      result.percentageUsed
    );
  }
};
