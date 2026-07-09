import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  Upload,
  Download,
  Trash2,
  Plus,
  Wallet,
  Receipt,
  Calendar,
  ChevronDown,
  ChevronRight,
  X,
  Sparkles,
} from 'lucide-react'
import { useSupplierStore } from '../store/useSupplierStore'
import { parseSupplierFile, buildTransactionRows, exportTransactionsToWorkbook } from '../lib/supplierImport'
import { supabase } from '../lib/supabase'
import Button from '../components/ui/Button'
import EmptyState from '../components/ui/EmptyState'
import StatCard from '../components/ui/StatCard'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function todayStr() {
  return new Date().toISOString().slice(0, 10)
}

export default function SupplierDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { suppliers, fetchSuppliers, transactions, transactionsLoading, fetchTransactions, importTransactions, deleteTransaction, addTransaction } =
    useSupplierStore()
  const fileInputRef = useRef(null)
  const [importing, setImporting] = useState(false)
  const [expandedDates, setExpandedDates] = useState(() => new Set())
  const [showAddTxn, setShowAddTxn] = useState(false)
  const [manual, setManual] = useState({ date: new Date().toISOString().slice(0, 10), amount: '', reference: '', description: '' })
  const [savingManual, setSavingManual] = useState(false)
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  const supplier = suppliers.find((s) => s.id === id)

  useEffect(() => {
    if (suppliers.length === 0) fetchSuppliers().catch(() => {})
    fetchTransactions(id).catch((err) => toast.error(err.message))
  }, [id])

  async function handleFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const { columns, rows } = await parseSupplierFile(file)
      if (rows.length === 0) {
        toast.error('That file has no rows to import.')
        return
      }
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const built = buildTransactionRows({ supplierId: id, columns, rows, userId: user?.id })
      await importTransactions(built)
      toast.success(`Imported ${built.length} transaction${built.length === 1 ? '' : 's'}.`)
      await Promise.all([fetchTransactions(id), fetchSuppliers()])
    } catch (err) {
      toast.error(err.message || 'Could not read that file.')
    } finally {
      setImporting(false)
    }
  }

  function handleExport() {
    if (transactions.length === 0) {
      toast.error('No transactions to export yet.')
      return
    }
    exportTransactionsToWorkbook(transactions, supplier?.name)
  }

  async function handleDelete(txnId) {
    try {
      await deleteTransaction(txnId)
      await fetchSuppliers()
      toast.success('Transaction removed.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleAddManual(e) {
    e.preventDefault()
    if (!manual.amount) {
      toast.error('Amount is required.')
      return
    }
    setSavingManual(true)
    try {
      await addTransaction({
        supplierId: id,
        txnDate: manual.date,
        amount: Number(manual.amount),
        referenceNo: manual.reference,
        description: manual.description,
      })
      await fetchSuppliers()
      setShowAddTxn(false)
      setManual({ date: new Date().toISOString().slice(0, 10), amount: '', reference: '', description: '' })
      toast.success('Transaction added.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSavingManual(false)
    }
  }

  // Group transactions by date for the "daily transactions" view,
  // restricted to the active date filter (if any).
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (dateFrom && t.txn_date < dateFrom) return false
      if (dateTo && t.txn_date > dateTo) return false
      return true
    })
  }, [transactions, dateFrom, dateTo])

  const grouped = useMemo(() => {
    const map = new Map()
    for (const t of filteredTransactions) {
      if (!map.has(t.txn_date)) map.set(t.txn_date, [])
      map.get(t.txn_date).push(t)
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1))
  }, [filteredTransactions])

  function toggleDate(date) {
    setExpandedDates((prev) => {
      const next = new Set(prev)
      if (next.has(date)) next.delete(date)
      else next.add(date)
      return next
    })
  }

  // All-time totals use net_amount (after the 3% commission is deducted
  // and rounded to the nearest 10) — the figure that actually matters
  // for settlement, not the raw imported amount.
  const totals = useMemo(() => {
    const totalNetAmount = transactions.reduce((sum, t) => sum + Number(t.net_amount ?? t.amount ?? 0), 0)
    return { totalNetAmount, count: transactions.length }
  }, [transactions])

  const today = todayStr()
  const todaySummary = useMemo(() => {
    const todaysTxns = transactions.filter((t) => t.txn_date === today)
    const netAmount = todaysTxns.reduce((sum, t) => sum + Number(t.net_amount ?? t.amount ?? 0), 0)
    const grossAmount = todaysTxns.reduce((sum, t) => sum + Number(t.amount || 0), 0)
    return { count: todaysTxns.length, netAmount, commission: grossAmount - netAmount }
  }, [transactions, today])

  const hasDateFilter = dateFrom || dateTo

  const inputClass =
    'w-full rounded-lg border border-border bg-bg px-3 py-2.5 text-[13.5px] outline-none transition-colors placeholder:text-muted focus:border-accent'

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/suppliers')}
            className="rounded-lg p-2 text-muted hover:bg-accent-soft hover:text-text"
          >
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-[22px] font-semibold tracking-tight">{supplier?.name || 'Supplier'}</h1>
            {supplier?.category && <p className="mt-0.5 text-[13px] text-muted">{supplier.category}</p>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFile} />
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            <Upload size={15} /> {importing ? 'Importing…' : 'Import'}
          </Button>
          <Button variant="secondary" onClick={handleExport}>
            <Download size={15} /> Export
          </Button>
          <Button onClick={() => setShowAddTxn((v) => !v)}>
            <Plus size={15} /> Add entry
          </Button>
        </div>
      </div>

      {/* Today's activity */}
      <div>
        <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">Today</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={Receipt} label="Today's Transactions" value={todaySummary.count} hint="Entries recorded today" tone="accent" />
          <StatCard icon={Wallet} label="Today's Net Amount" value={formatMoney(todaySummary.netAmount)} hint="After 3% commission, rounded to nearest 10" tone="warning" />
          <StatCard icon={Sparkles} label="Today's Commission" value={formatMoney(todaySummary.commission)} hint="3% deducted today" tone="success" />
        </div>
      </div>

      {/* All-time overview */}
      <div>
        <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">All time</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          <StatCard icon={Wallet} label="Total Net Amount" value={formatMoney(totals.totalNetAmount)} hint="After 3% commission, rounded to nearest 10" tone="warning" />
          <StatCard icon={Receipt} label="Transactions" value={totals.count} hint="Imported + manual entries" tone="accent" />
          <StatCard icon={Calendar} label="Last Activity" value={formatDate(supplier?.last_txn_date)} hint="Most recent transaction date" tone="success" />
        </div>
      </div>

      {/* Date filter */}
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          title="From date"
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-accent"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          title="To date"
          className="rounded-xl border border-border bg-surface px-3.5 py-2.5 text-[13px] outline-none transition-colors focus:border-accent"
        />
        {hasDateFilter && (
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setDateFrom('')
              setDateTo('')
            }}
          >
            <X size={14} /> Clear
          </Button>
        )}
      </div>

      {showAddTxn && (
        <form onSubmit={handleAddManual} className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4 shadow-card sm:flex-row sm:items-end sm:flex-wrap">
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">Date</span>
            <input type="date" value={manual.date} onChange={(e) => setManual({ ...manual, date: e.target.value })} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">Amount</span>
            <input type="number" step="0.01" placeholder="0.00" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} className={inputClass} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">Reference</span>
            <input placeholder="Optional" value={manual.reference} onChange={(e) => setManual({ ...manual, reference: e.target.value })} className={inputClass} />
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <span className="text-[11.5px] font-medium uppercase tracking-wide text-muted">Description</span>
            <input placeholder="Optional" value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} className={inputClass} />
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowAddTxn(false)}>Cancel</Button>
            <Button type="submit" disabled={savingManual}>{savingManual ? 'Saving…' : 'Save'}</Button>
          </div>
        </form>
      )}

      <div>
        <h2 className="mb-2.5 text-[12.5px] font-semibold uppercase tracking-wide text-muted">
          Daily transactions{hasDateFilter ? ' (filtered)' : ''}
        </h2>

        {transactionsLoading && <p className="text-[13px] text-muted">Loading transactions…</p>}

        {!transactionsLoading && grouped.length === 0 && (
          <EmptyState
            icon={Receipt}
            title={transactions.length === 0 ? 'No transactions yet' : 'No transactions in this range'}
            description={
              transactions.length === 0
                ? 'Import a daily/monthly report, or add an entry manually.'
                : 'Try a different date range.'
            }
            action={
              transactions.length === 0 ? (
                <Button onClick={() => fileInputRef.current?.click()}>
                  <Upload size={15} /> Import file
                </Button>
              ) : undefined
            }
          />
        )}

        {grouped.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {grouped.map(([date, rows]) => {
              const dayNetTotal = rows.reduce((sum, t) => sum + Number(t.net_amount ?? t.amount ?? 0), 0)
              const isOpen = expandedDates.has(date)
              return (
                <div key={date} className="overflow-hidden rounded-2xl border border-border bg-surface shadow-card">
                  <button
                    onClick={() => toggleDate(date)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left"
                  >
                    <div className="flex items-center gap-2.5">
                      {isOpen ? <ChevronDown size={16} className="text-muted" /> : <ChevronRight size={16} className="text-muted" />}
                      <span className="text-[13.5px] font-semibold">{formatDate(date)}</span>
                      <span className="text-[12px] text-muted">{rows.length} txn{rows.length === 1 ? '' : 's'}</span>
                    </div>
                    <span className="text-[13.5px] font-semibold">{formatMoney(dayNetTotal)}</span>
                  </button>

                  {isOpen && (
                    <div className="overflow-x-auto border-t border-border">
                      <table className="w-full min-w-[680px] text-[12.5px]">
                        <thead>
                          <tr className="border-b border-border text-left text-muted">
                            <th className="px-4 py-2.5 font-medium">Reference</th>
                            <th className="px-4 py-2.5 font-medium">Description</th>
                            <th className="px-4 py-2.5 text-right font-medium">Amount</th>
                            <th className="px-4 py-2.5 text-right font-medium">Commission (3%)</th>
                            <th className="px-4 py-2.5 text-right font-medium">Net Amount</th>
                            <th className="px-4 py-2.5 text-right font-medium"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((t) => {
                            const netAmount = Number(t.net_amount ?? t.amount ?? 0)
                            const commission = Number(t.amount || 0) - netAmount
                            return (
                              <tr key={t.id} className="border-b border-border last:border-0">
                                <td className="px-4 py-2.5">{t.reference_no || '—'}</td>
                                <td className="px-4 py-2.5">{t.description || '—'}</td>
                                <td className="px-4 py-2.5 text-right">{formatMoney(t.amount)}</td>
                                <td className="px-4 py-2.5 text-right text-muted">{formatMoney(commission)}</td>
                                <td className="px-4 py-2.5 text-right font-medium">{formatMoney(netAmount)}</td>
                                <td className="px-4 py-2.5 text-right">
                                  <button onClick={() => handleDelete(t.id)} className="rounded-md p-1.5 text-muted hover:bg-danger-soft hover:text-danger">
                                    <Trash2 size={14} />
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
