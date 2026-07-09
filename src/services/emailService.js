import { supabase } from '../lib/supabase'

export async function sendInvoiceEmail({ customerName, customerEmail, invoiceNumber, items, total, date }) {
  const { data, error } = await supabase.functions.invoke('send-invoice-email', {
    body: { customerName, customerEmail, invoiceNumber, items, total, date },
  })
  if (error) throw error
  return data
}
