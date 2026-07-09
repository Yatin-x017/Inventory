import { useState } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { X, UploadCloud, FileSpreadsheet, Download, CheckCircle2, AlertTriangle } from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import Button from './ui/Button'
import { parseCustomersWorkbook, buildCustomersFromRows, exportFailedCustomerRows } from '../lib/customersExcel'

// Import happens in three stages: pick a file -> review what will be
// created/skipped -> submit. Unlike the bills importer, there's no fixed
// template to download first — any sheet with recognizably-named columns
// (Name/Customer Name, Phone/Mobile, Address, Notes, Assigned To…) works,
// matched loosely in src/lib/customersExcel.js.
export default function ImportCustomersModal({ onClose, onDone }) {
  const { customers, marketingMembers, addCustomer } = useCustomerStore()
  const { profile, isTopTierCustomers } = useAuth()
  const [stage, setStage] = useState('upload') // 'upload' | 'review' | 'importing' | 'results'
  const [fileName, setFileName] = useState('')
  const [toCreate, setToCreate] = useState([])
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
      const rows = await parseCustomersWorkbook(file)
      if (rows.length === 0) {
        setParseError('That file has no rows to import.')
        return
      }
      const { toCreate: built, rowErrors: builtRowErrors } = buildCustomersFromRows(rows, {
        existingCustomers: customers,
        marketingMembers,
      })
      if (built.length === 0 && builtRowErrors.length === 0) {
        setParseError(
          "Couldn't find any recognizable columns — make sure the sheet has a name/customer column at least."
        )
        return
      }
      setToCreate(built)
      setRowErrors(builtRowErrors)
      setStage('review')
    } catch (err) {
      setParseError('Could not read that file — make sure it is a .xlsx, .xls, or .csv file.')
    }
  }

  async function handleImport() {
    setStage('importing')
    const succeeded = []
    const failed = []
    for (let i = 0; i < toCreate.length; i++) {
      const r = toCreate[i]
      try {
        // Marketing members always add to their own book — mirrors
        // AddCustomerModal's rule, since RLS requires it anyway.
        const effectiveAssignedTo = isTopTierCustomers ? r.assignedTo : profile?.id
        await addCustomer({
          name: r.name,
          phone: r.phone,
          address: r.address,
          notes: r.notes,
          assignedTo: effectiveAssignedTo,
        })
        succeeded.push(r)
      } catch (err) {
        failed.push({
          row: { Name: r.name, Phone: r.phone, Address: r.address },
          reason: `Row ${r.rowNumber}: ${err.message}`,
        })
      }
      setProgress(Math.round(((i + 1) / toCreate.length) * 100))
    }
    setResults({ succeeded, failed })
    setStage('results')
  }

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
            <h2 className="text-[15px] font-semibold">Import retailers from Excel</h2>
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
                No fixed template needed — upload any .xlsx, .xls, or .csv file with a name column
                (e.g. "Name", "Customer Name", "Retailer") and, optionally, Phone/Mobile, Address,
                Notes, and Assigned To columns. Other columns are ignored.
              </p>
              <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-border py-10 text-center hover:border-accent/40">
                <UploadCloud size={28} className="text-muted" />
                <span className="text-[13.5px] font-medium">Click to choose a .xlsx, .xls, or .csv file</span>
                <span className="text-[12px] text-muted">Any sheet with a name column will work</span>
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
                  Will create <strong>{toCreate.length}</strong> retailer{toCreate.length === 1 ? '' : 's'}
                </p>
              </div>

              {toCreate.length > 0 && (
                <div className="flex max-h-48 flex-col gap-1.5 overflow-y-auto rounded-lg border border-border p-2">
                  {toCreate.map((r, i) => (
                    <div key={i} className="flex items-center justify-between rounded-md px-2 py-1.5 text-[12.5px]">
                      <span className="truncate">{r.name}</span>
                      <span className="text-muted">{r.phone || '—'}</span>
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

              {toCreate.length === 0 && (
                <p className="text-[13px] text-danger">Nothing to import — fix the rows above and re-upload.</p>
              )}
            </>
          )}

          {stage === 'importing' && (
            <div className="flex flex-col items-center gap-3 py-8">
              <div className="h-2 w-full overflow-hidden rounded-full bg-border">
                <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-[13px] text-muted">Creating retailers… {progress}%</p>
            </div>
          )}

          {stage === 'results' && (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-success-soft/50 px-3 py-2.5 text-[13.5px] text-success">
                <CheckCircle2 size={16} /> {results.succeeded.length} retailer{results.succeeded.length === 1 ? '' : 's'} created
              </div>
              {results.failed.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
                  <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-danger">
                    <AlertTriangle size={14} /> {results.failed.length} retailer{results.failed.length === 1 ? '' : 's'} failed
                  </p>
                  <div className="flex max-h-32 flex-col gap-1 overflow-y-auto">
                    {results.failed.map((f, i) => (
                      <p key={i} className="text-[12px] text-muted">{f.reason}</p>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => exportFailedCustomerRows(results.failed)}
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
              <Button type="button" onClick={handleImport} disabled={toCreate.length === 0}>
                Import {toCreate.length || ''} retailer{toCreate.length === 1 ? '' : 's'}
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
          {stage === 'upload' && (
            <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
          )}
        </div>
      </motion.div>
    </motion.div>,
    document.body
  )
}
