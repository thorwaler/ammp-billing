import { supabase } from '@/integrations/supabase/client';
import { parseDateCET, formatDateCET } from '@/lib/dateUtils';
import { differenceInDays, subDays } from 'date-fns';

export type InvoiceDueState = 'heads_up' | 'due' | 'overdue' | 'none';

export interface InvoiceDueStatus {
  state: InvoiceDueState;
  createByDate: Date;
  daysUntilCreateBy: number;
}

const HEADS_UP_WINDOW_DAYS = 3;

export const checkInvoiceDueStatus = (
  nextInvoiceDate: string,
  leadDays: number,
): InvoiceDueStatus => {
  const invoiceDate = parseDateCET(nextInvoiceDate);
  const createByDate = leadDays > 0 ? subDays(invoiceDate, leadDays) : invoiceDate;

  const today = parseDateCET(new Date().toISOString());
  today.setHours(0, 0, 0, 0);
  const createBy = new Date(createByDate);
  createBy.setHours(0, 0, 0, 0);

  const daysUntilCreateBy = differenceInDays(createBy, today);

  let state: InvoiceDueState = 'none';
  if (daysUntilCreateBy < 0) state = 'overdue';
  else if (daysUntilCreateBy === 0) state = 'due';
  else if (daysUntilCreateBy <= HEADS_UP_WINDOW_DAYS) state = 'heads_up';

  return { state, createByDate, daysUntilCreateBy };
};

const TYPE_BY_STATE: Record<Exclude<InvoiceDueState, 'none'>, string> = {
  heads_up: 'invoice_due_soon',
  due: 'invoice_due_today',
  overdue: 'invoice_overdue',
};

const TITLE_BY_STATE: Record<Exclude<InvoiceDueState, 'none'>, string> = {
  heads_up: 'Invoice Due Soon',
  due: 'Invoice Due Today',
  overdue: 'Invoice Overdue',
};

export const checkAllInvoiceDueDates = async (userId: string) => {
  const { data: contracts } = await supabase
    .from('contracts')
    .select('id, company_name, contract_name, next_invoice_date, invoice_lead_days, invoicing_type, contract_status')
    .eq('contract_status', 'active')
    .in('invoicing_type', ['standard', 'manual'])
    .not('next_invoice_date', 'is', null);

  if (!contracts) return;

  for (const contract of contracts) {
    if (!contract.next_invoice_date) continue;

    const leadDays = contract.invoice_lead_days ?? 0;
    const { state, createByDate, daysUntilCreateBy } = checkInvoiceDueStatus(
      contract.next_invoice_date,
      leadDays,
    );

    if (state === 'none') continue;

    const type = TYPE_BY_STATE[state];
    const title = TITLE_BY_STATE[state];

    // Dedup: same type + same contract + same next_invoice_date in metadata
    const { data: existing } = await supabase
      .from('notifications')
      .select('id')
      .eq('contract_id', contract.id)
      .eq('type', type)
      .eq('metadata->>next_invoice_date', contract.next_invoice_date)
      .limit(1);

    if (existing && existing.length > 0) continue;

    const displayName = contract.contract_name || contract.company_name;
    const createByStr = formatDateCET(createByDate.toISOString(), 'MMM d, yyyy');
    const invoiceDateStr = formatDateCET(contract.next_invoice_date, 'MMM d, yyyy');

    let message: string;
    if (state === 'overdue') {
      message = `Invoice for "${displayName}" is overdue — was due to be created by ${createByStr} (invoice date ${invoiceDateStr}).`;
    } else if (state === 'due') {
      message = `Invoice for "${displayName}" should be created today (invoice date ${invoiceDateStr}).`;
    } else {
      message = `Invoice for "${displayName}" should be created by ${createByStr} (invoice date ${invoiceDateStr}).`;
    }

    await supabase.from('notifications').insert({
      user_id: userId,
      contract_id: contract.id,
      type,
      title,
      message,
      severity: state === 'heads_up' ? 'info' : 'warning',
      metadata: {
        next_invoice_date: contract.next_invoice_date,
        create_by_date: createByDate.toISOString(),
        lead_days: leadDays,
        days_until_create_by: daysUntilCreateBy,
        company_name: contract.company_name,
        contract_name: contract.contract_name,
      },
    });
  }
};
