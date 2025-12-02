import { supabase } from '@/integrations/supabase/client';

export interface ContractExpirationResult {
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number;
  expiryDate: Date;
}

export const checkContractExpiration = (periodEnd: string): ContractExpirationResult => {
  // Parse as local date to avoid timezone issues
  const endStr = periodEnd.split('T')[0] || periodEnd.substring(0, 10);
  const [year, month, day] = endStr.split('-').map(Number);
  const expiryDate = new Date(year, month - 1, day);
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const daysUntilExpiry = Math.ceil((expiryDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    isExpired: daysUntilExpiry < 0,
    isExpiringSoon: daysUntilExpiry >= 0 && daysUntilExpiry <= 30,
    daysUntilExpiry,
    expiryDate,
  };
};

export const createContractExpirationNotification = async (
  userId: string,
  contractId: string,
  companyName: string,
  contractName: string | null,
  daysUntilExpiry: number,
  expiryDate: Date
) => {
  const isExpired = daysUntilExpiry < 0;
  const displayName = contractName || companyName;
  
  await supabase.from('notifications').insert({
    user_id: userId,
    contract_id: contractId,
    type: isExpired ? 'contract_expired' : 'contract_expiring_soon',
    title: isExpired ? 'Contract Expired' : 'Contract Expiring Soon',
    message: isExpired 
      ? `Contract "${displayName}" has expired.`
      : `Contract "${displayName}" expires in ${daysUntilExpiry} day${daysUntilExpiry === 1 ? '' : 's'}.`,
    severity: isExpired ? 'warning' : 'info',
    metadata: { companyName, contractName, daysUntilExpiry, expiryDate: expiryDate.toISOString() },
  });
};

export const checkAllContractExpirations = async (userId: string) => {
  // Fetch all active contracts with expiry dates
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, company_name, contract_name, period_end')
    .eq('user_id', userId)
    .eq('contract_status', 'active')
    .not('period_end', 'is', null);

  if (!contracts) return;

  for (const contract of contracts) {
    if (!contract.period_end) continue;
    
    const result = checkContractExpiration(contract.period_end);
    
    // Only process if expired or expiring soon
    if (!result.isExpired && !result.isExpiringSoon) continue;
    
    // Check if we've already notified recently (last 7 days)
    const { data: existingNotification } = await supabase
      .from('notifications')
      .select('id')
      .eq('contract_id', contract.id)
      .in('type', ['contract_expired', 'contract_expiring_soon'])
      .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
      .limit(1);

    if (existingNotification && existingNotification.length > 0) continue;

    await createContractExpirationNotification(
      userId,
      contract.id,
      contract.company_name,
      contract.contract_name,
      result.daysUntilExpiry,
      result.expiryDate
    );
  }
};
