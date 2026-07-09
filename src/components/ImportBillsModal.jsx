import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useStore } from '../store/useStore'
import Button from './ui/Button'
import {
  downloadBillsImportTemplate,
  parseBillsWorkbook,
  buildBillGroupsFromRows,
  exportFailedRows,
} from '../lib/billsExcel'
import { generateAndStoreInvoicePdf } from '../lib/invoicePdf'

// Import happens in three stages: pick a file -> review what will be
// created/skipped -> submit. Bills are created one at a time (not in
// parallel) because completeSale() re-reads `items` stock after every
// call, and two rows in the same file can legitimately draw down the
// same item's stock — running them in parallel would let both pass the
// same stale stock check.
export default function ImportBillsModal({ onClose, onDone }) {
  const { items, completeSale } = useStore()
  const [stage, setStage] = useState('upload') // 'upload' | 'review' | 'importing' | 'results'
  const [fileName, setFileName] = useState('')
  const [groups, setGroups] = useState([])
  const [rowErrors, setRowErrors] = useState([])
  const [parseError, setParseError] = useState('')
  const [progress, setProgress] = useState(0)
  const [results, setResults] = useState({ succeeded: [], failed: [] })

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-selecting the same file after fixing it
    if (!file) return
    setParseError('')
    setFileName(file.name)
    try {
      const rows = await parseBillsWorkbook(file)
      if (rows.length === 0) {
        setParseError('That file has no rows to import.')
        return
      }
      const { groups: builtGroups, rowErrors: builtRowErrors } = buildBillGroupsFromRows(rows, items)
      setGroups(builtGroups)
      setRowErrors(builtRowErrors)
      setStage('review')
    } catch (err) {
      setParseError('Could not read that file — make sure it is a .xlsx or .csv exported from the template.')
    }
  }

  async function handleImport() {
    setStage('importing')
    const succeeded = []
    const failed = []
    for (let i = 0; i < groups.length; i++) {
      const g = groups[i]
      try {
        const sale = await completeSale({
          customerName: g.customerName,
          customerEmail: g.customerEmail,
          customerPhone: g.customerPhone,
          notes: g.notes,
          cartLines: g.cartLines,
          discount: g.discount,
          paymentMethod: g.paymentMethod,
          paidAmount: g.paidAmount == null ? undefined : g.paidAmount,
          saleDate: g.saleDate || undefined,
        })
        succeeded.push({ group: g, invoiceNumber: sale.invoiceNumber })
        // Fire-and-forget, same as a live checkout (see src/lib/invoicePdf.js)
        // — without this, imported bills would never get a stored PDF and
        // Bill Logs' "Original PDF" button would never appear for them.
        generateAndStoreInvoicePdf({
          id: sale.id,
          invoiceNumber: sale.invoiceNumber,
          lines: sale.lines ?? g.cartLines,
          subtotal: sale.subtotal,
          discount: sale.discount ?? g.discount,
          paymentMethod: sale.paymentMethod ?? g.paymentMethod,
          emiCompany: sale.emiCompany ?? null,
          total: sale.total,
          paidAmount: sale.paidAmount,
          dueAmount: sale.dueAmount,
          customerName: g.customerName,
          customerPhone: g.customerPhone,
          created_at: sale.createdAt || new Date().toISOString(),
          saleDate: sale.saleDate || g.saleDate,
        })
      } catch (err) {
        failed.push({
          row: {
            'Bill Group': g.key.startsWith('__row_') ? '' : g.key,
            'Customer Name': g.customerName,
            'Customer Phone': g.customerPhone,
          },
          reason: `Rows ${g.sourceRows.join(', ')}: ${err.message}`,
        })
      }
      setProgress(Math.round(((i + 1) / groups.length) * 100))
    }
    setResults({ succeeded, failed })
    setStage('results')
  }

  const totalLines = groups.reduce((s, g) => s + g.cartLines.length, 0)

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onMouseDown={stage === 'importing' ? undefined : onClose}
      className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-sm sm:items-center sm:p-5"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ type: 'spring', damping: 24, stiffness: 320 }}
        onMouseDown={(e) => e.stopPropagation()}
        className="max-h-[90vh] w-full overflow-y-auto rounded-t-2xl border border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] shadow-card-hover backdrop-blur-xl sm:max-w-[640px] sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2">
            <FileSpreadsheet size={16} className="text-accent" />
            <h2 className="text-[15px] font-semibold">Import bills from Excel</h2>
          </div>
          {stage !== 'importing' && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted hover:bg-accent-soft hover:text-text"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="flex flex-col gap-5 px-5 py-5">
          {stage === 'upload' && (
            <>
              <p className="rounded-lg bg-accent-soft/50 px-3 py-2 text-[12.5px] text-muted">
                Only standard inventory items can be imported this way (not serialized IMEI
                products, which need a specific unit picked per sale). Each row needs at least an
                item SKU or name that already exists in your catalog.
              </p>
              <button
                type="button"
                onClick={downloadBillsImportTemplate}
                className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2.5 text-[12.5px] font-medium text-muted hover:border-accent/40 hover:text-accent"
              >
                <Download size={14} /> Download template
              </button>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-10 text-center hover:border-accent/40">
                <UploadCloud size={28} className="text-muted" />
                <span className="text-[13.5px] font-medium">Click to choose a .xlsx or .csv file</span>
                <span className="text-[12px] text-muted">Filled out from the template above</span>
                <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
              </label>
              {parseError && <p className="text-[13px] text-danger">{parseError}</p>}
            </>
          )}

          {stage === 'review' && (
            <>
              <div className="flex flex-col gap-1">
                <p className="text-[13.5px] font-medium">{fileName}</p>
                <p className="text-[12.5px] text-muted">
                  Will create <strong>{groups.length}</strong> bill{groups.length === 1 ? '' : 's'} ·{' '}
                  {totalLines} line item{totalLines === 1 ? '' : 's'}
                </p>
              </div>

              {groups.length > 0 && (
                <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {groups.map((g) => (
                    <div key={g.key} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]">
                      <span className="truncate">
                        {g.customerName} · {g.cartLines.length} item{g.cartLines.length === 1 ? '' : ''}
                      </span>
                      <span className="text-muted">
                        ₹{g.cartLines.reduce((s, l) => s + l.unit_price * l.quantity, 0).toLocaleString('en-IN')}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {rowErrors.length > 0 && (
                <div className="flex flex-col gap-1.5 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
                    <AlertTriangle size={14} /> {rowErrors.length} row{rowErrors.length === 1 ? '' : 's'} will be skipped
                  </p>
                  <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {rowErrors.map((e, i) => (
                      <p key={i} className="text-[12px] text-muted">{e.reason}</p>
                    ))}
                  </div>
                </div>
              )}

              {groups.length === 0 && (
                <p className="text-[13px] text-danger">
                  Nothing to import — fix the rows above and re-upload.
                </p>
              )}
            </>
          )}

          {stage === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[13px] text-muted">Creating bills… {progress}%</p>
            </div>
          )}

          {stage === 'results' && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-success-soft/50 px-3 py-2.5 text-[13.5px] text-success">
                <CheckCircle2 size={16} /> {results.succeeded.length} bill{results.succeeded.length === 1 ? '' : 's'} created
              </div>
              {results.failed.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
                    <AlertTriangle size={14} /> {results.failed.length} bill{results.failed.length === 1 ? '' : 's'} failed
                  </p>
                  <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {results.failed.map((f, i) => (
                      <p key={i} className="text-[12px] text-muted">{f.reason}</p>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => exportFailedRows(results.failed)}
                    className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-border py-2 text-[12.5px] font-medium text-muted hover:border-accent/40 hover:text-accent"
                  >
                    <Download size={14} /> Download failed rows
                  </button>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex justify-end gap-2.5 border-t border-border px-5 py-4">
          {stage === 'review' && (
            <>
              <Button type="button" variant="secondary" onClick={() => setStage('upload')}>Back</Button>
              <Button type="button" onClick={handleImport} disabled={groups.length === 0}>
                Import {groups.length || ''} bill{groups.length === 1 ? '' : 's'}
              </Button>
            </>
          )}
          {stage === 'results' && (
            <Button
              type="button"
              onClick={() => {
                onDone?.()
                onClose()
              }}
            >
              Done
            </Button>
          )}
          {(stage === 'upload') && (
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
