// Generates a permanent PDF copy of a bill's invoice at checkout time and
// uploads it to the private `invoices` storage bucket, so Bill Logs can
// later show/download the *exact* thing that was printed/emailed —
// instead of only ever re-rendering InvoicePrint from bill_items, which
// would silently drift if the layout changes later or a referenced item
// gets edited/deleted.
//
// Called from Billing.jsx and CreateBillModal.jsx right after a sale
// completes, with the same `receipt` shape passed to <ReceiptModal>.
// Best-effort and non-blocking by design (see the try/catch below and the
// call sites, which fire this without awaiting it): a failure here must
// never undo or block a sale that's already been recorded. A bill whose
// PDF never made it up simply falls back to the reconstructed view in
// Bill Logs (see billToReceipt in src/pages/BillLogs.jsx).
//
// See supabase/migrations/20260705b_invoice_pdf_storage.sql for the
// bills.invoice_pdf_path column + `invoices` bucket + RLS this relies on,
// and supabase/functions/backup-export/index.ts for how these PDFs also
// get mirrored into weekly backups.

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { supabase } from './supabase'
import InvoicePrint from '../components/InvoicePrint'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

async function renderInvoicePdfBlob(receipt) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
    import('html2canvas'),
    import('jspdf'),
  ])

  // Mounted off-screen (not display:none — html2canvas can't measure or
  // rasterize an element the browser never actually laid out) so nothing
  // flashes on screen while the snapshot is taken.
  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    await new Promise((resolve) => {
      root.render(createElement(InvoicePrint, { receipt, forCapture: true }))
      // Two rAF ticks: one for React to commit, one for layout to settle
      // before html2canvas walks the DOM.
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    const node = container.firstChild
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })

    const imgWidth = A4_WIDTH_MM
    const imgHeight = (canvas.height * imgWidth) / canvas.width

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    const imgData = canvas.toDataURL('image/jpeg', 0.92)
    // Most invoices fit a single A4 page; on the rare very-long bill this
    // clips rather than adding pages, which is an acceptable trade-off
    // versus the complexity of paginating a rasterized image.
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidth, Math.min(imgHeight, A4_HEIGHT_MM))

    return pdf.output('blob')
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}

// receipt: the same shape passed to <ReceiptModal receipt={...} /> — must
// have at least `id` (the bill's id, used as the storage path/filename).
// Returns true/false rather than throwing, so existing call sites that
// fire this off without awaiting it are unaffected; callers that DO want
// to know whether it worked (e.g. a manual "Generate PDF" retry) can await
// the boolean instead of assuming success.
export async function generateAndStoreInvoicePdf(receipt) {
  if (!receipt?.id) return false
  try {
    const blob = await renderInvoicePdfBlob(receipt)
    const path = `${receipt.id}.pdf`

    const { error: uploadError } = await supabase.storage
      .from('invoices')
      .upload(path, blob, { contentType: 'application/pdf', upsert: true })
    if (uploadError) throw uploadError

    const { error: updateError } = await supabase
      .from('bills')
      .update({ invoice_pdf_path: path })
      .eq('id', receipt.id)
    if (updateError) throw updateError
    return true
  } catch (err) {
    // Deliberately swallowed — see the file header. The sale itself is
    // already saved; only the stored-PDF convenience copy is at risk here.
    console.error('Failed to generate/store invoice PDF copy:', err)
    return false
  }
}

// Bill Logs' "Original PDF" button — a short-lived signed URL since the
// bucket is private.
export async function getInvoicePdfUrl(path) {
  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, 120)
  if (error) throw error
  return data.signedUrl
}
