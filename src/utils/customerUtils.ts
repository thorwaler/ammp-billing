/**
 * Returns the display name for a customer - nickname if present, otherwise official name
 */
export const getCustomerDisplayName = (customer: { name: string; nickname?: string | null }): string => {
  return customer.nickname || customer.name;
};
