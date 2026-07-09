import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import {
  ArrowLeft,
  ArrowDownCircle,
  ArrowUpCircle,
  Pencil,
  Trash2,
  Receipt,
  Phone,
  MapPin,
  UserCog,
  FileDown,
  X,
} from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import AddCustomerModal from '../components/AddCustomerModal'
import AddTransactionModal from '../components/AddTransactionModal'
import StatementModal from '../components/StatementModal'

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

const TYPE_META = {
  udhar: {
    label: 'Udhar given',
    icon: ArrowUpCircle,
    sign: '+',
    badgeClass: 'bg-danger-soft text-danger',
    amountClass: 'text-danger',
  },
  payment: {
    label: 'Payment received',
    icon: ArrowDownCircle,
    sign: '-',
    badgeClass: 'bg-success-soft text-success',
    amountClass: 'text-success',
  },
  owed: {
    label: 'You owe them',
    icon: ArrowDownCircle,
    sign: '-',
    badgeClass: 'bg-warning-soft text-warning',
    amountClass: 'text-warning',
  },
  paid_out: {
    label: 'You paid them',
    icon: ArrowUpCircle,
    sign: '+',
    badgeClass: 'bg-accent-soft text-accent',
    amountClass: 'text-accent',
  },
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    customers,
    transactions,
    transactionsLoading,
    fetchCustomers,
    fetchTransactions,
    deleteCustomer,
    deleteTransaction,
    updateCustomer,
    marketingMembers,
    fetchMarketingMembers,
  } = useCustomerStore()
  const { isTopTierCustomers } = useAuth()
  const [showEdit, setShowEdit] = useState(false)
  const [txnModal, setTxnModal] = useState(null) // 'udhar' | 'payment' | 'owed' | 'paid_out' | null
  const [showStatement, setShowStatement] = useState(false)
  const [assigning, setAssigning] = useState(false)

  // Ledger filters — date range + transaction type.
  const [typeFilter, setTypeFilter] = useState('all')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  useEffect(() => {
    if (customers.length === 0) fetchCustomers()
    fetchTransactions(id)
  }, [id])

  useEffect(() => {
    if (isTopTierCustomers) fetchMarketingMembers().catch(() => {})
  }, [isTopTierCustomers])

  const customer = customers.find((c) => c.id === id)

  const balance = useMemo(() => {
    return transactions.reduce((sum, t) => {
      const sign = t.type === 'udhar' || t.type === 'paid_out' ? 1 : -1
      return sum + sign * t.amount
    }, 0)
  }, [transactions])

  const todayActivity = useMemo(() => {
    return transactions
      .filter((t) => t.transaction_date === todayStr())
      .reduce((sum, t) => sum + Number(t.amount), 0)
  }, [transactions])

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (typeFilter !== 'all' && t.type !== typeFilter) return false
      if (dateFrom && t.transaction_date < dateFrom) return false
      if (dateTo && t.transaction_date > dateTo) return false
      return true
    })
  }, [transactions, typeFilter, dateFrom, dateTo])

  const hasLedgerFilters = typeFilter !== 'all' || dateFrom || dateTo

  function clearLedgerFilters() {
    setTypeFilter('all')
    setDateFrom('')
    setDateTo('')
  }

  async function handleAssign(e) {
    const value = e.target.value
    setAssigning(true)
    try {
      await updateCustomer(id, {
        name: customer.name,
        phone: customer.phone,
        address: customer.address,
        notes: customer.notes,
        assignedTo: value,
      })
      toast.success(value ? 'Retailer assigned' : 'Retailer unassigned')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setAssigning(false)
    }
  }

  async function handleDeleteCustomer() {
    if (!confirm(`Delete ${customer?.name}? This removes their entire ledger too.`)) return
    try {
      await deleteCustomer(id)
      toast.success('Retailer deleted')
      navigate('/customers')
    } catch (err) {
      toast.error(err.message)
    }
  }

  async function handleDeleteTransaction(txnId) {
    if (!confirm('Delete this transaction?')) return
    try {
      await deleteTransaction(txnId, id)
      toast.success('Transaction removed')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (!customer && customers.length > 0) {
    return (
      <EmptyState icon={Receipt} title="Retailer not found" description="It may have been deleted." />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate('/customers')}
        className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} /> Back to retailers
      </button>

      <div className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-border bg-surface p-5 shadow-card">
        <div className="min-w-0">
          <h1 className="text-[20px] font-semibold tracking-tight">{customer?.name ?? '…'}</h1>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-[13px] text-muted">
            {customer?.phone && (
              <span className="flex items-center gap-1.5"><Phone size={13} /> {customer.phone}</span>
            )}
            {customer?.address && (
              <span className="flex items-center gap-1.5"><MapPin size={13} /> {customer.address}</span>
            )}
            {isTopTierCustomers && (
              <span className="flex items-center gap-1.5">
                <UserCog size={13} />
                <select
                  value={customer?.assigned_to ?? ''}
                  onChange={handleAssign}
                  disabled={assigning}
                  className="rounded-md border border-border bg-bg px-2 py-1 text-[12.5px] outline-none transition-colors focus:border-accent disabled:opacity-60"
                  title="Assign marketing member"
                >
                  <option value="">Unassigned (house account)</option>
                  {marketingMembers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </span>
            )}
          </div>
          {customer?.notes && <p className="mt-2 text-[12.5px] text-muted">{customer.notes}</p>}
          {todayActivity > 0 && (
            <p className="mt-2 text-[12.5px] font-medium text-accent">
              {formatMoney(todayActivity)} in ledger activity today
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2">
          {balance > 0 ? (
            <Badge tone="danger" className="text-[13px]">{formatMoney(balance)} due</Badge>
          ) : balance < 0 ? (
            <Badge tone="warning" className="text-[13px]">You owe {formatMoney(Math.abs(balance))}</Badge>
          ) : (
            <Badge tone="neutral" className="text-[13px]">Settled</Badge>
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setShowStatement(true)}>
              <FileDown size={13} /> Statement
            </Button>
            <Button variant="secondary" onClick={() => setShowEdit(true)}>
              <Pencil size={13} /> Edit
            </Button>
            <Button variant="danger" onClick={handleDeleteCustomer}>
              <Trash2 size={13} />
            </Button>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <Button variant="secondary" className="border-danger/40 text-danger hover:border-danger" onClick={() => setTxnModal('udhar')}>
          <ArrowUpCircle size={15} /> Add udhar
        </Button>
        <Button variant="secondary" className="border-success/40 text-success hover:border-success" onClick={() => setTxnModal('payment')}>
          <ArrowDownCircle size={15} /> Record payment
        </Button>
        <Button variant="secondary" className="border-warning/40 text-warning hover:border-warning" onClick={() => setTxnModal('owed')}>
          <ArrowDownCircle size={15} /> You owe them
        </Button>
        <Button variant="secondary" className="border-accent/40 text-accent hover:border-accent" onClick={() => setTxnModal('paid_out')}>
          <ArrowUpCircle size={15} /> You paid them
        </Button>
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
          <h2 className="text-[15px] font-semibold">Ledger</h2>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent"
            >
              <option value="all">All types</option>
              <option value="udhar">Udhar given</option>
              <option value="payment">Payment received</option>
              <option value="owed">You owe them</option>
              <option value="paid_out">You paid them</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              title="From date"
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              title="To date"
              className="rounded-lg border border-border bg-bg px-2.5 py-1.5 text-[12.5px] outline-none transition-colors focus:border-accent"
            />
            {hasLedgerFilters && (
              <Button variant="ghost" size="sm" onClick={clearLedgerFilters}>
                <X size={12} /> Clear
              </Button>
            )}
          </div>
        </div>

        {transactionsLoading && <p className="text-[13px] text-muted">Loading transactions…</p>}

        {!transactionsLoading && transactions.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Add an udhar entry or record a payment to start this retailer's ledger."
          />
        )}

        {!transactionsLoading && transactions.length > 0 && filteredTransactions.length === 0 && (
          <EmptyState icon={Receipt} title="No transactions match these filters" />
        )}

        {filteredTransactions.length > 0 && (
          <div className="flex flex-col gap-2">
            {filteredTransactions.map((t) => {
              const meta = TYPE_META[t.type]
              const Icon = meta.icon
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface p-3.5 shadow-card"
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.badgeClass}`}
                    >
                      <Icon size={16} />
                    </span>
                    <div>
                      <div className="text-[13.5px] font-medium">{meta.label}</div>
                      <div className="text-[12px] text-muted">
                        {formatDate(t.transaction_date)}
                        {t.description ? ` · ${t.description}` : ''}
                        {t.profiles?.full_name ? ` · by ${t.profiles.full_name}` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-[14px] font-semibold ${meta.amountClass}`}>
                      {meta.sign}
                      {formatMoney(t.amount)}
                    </span>
                    <button
                      onClick={() => handleDeleteTransaction(t.id)}
                      className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
                      aria-label="Delete transaction"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {showEdit && customer && <AddCustomerModal customer={customer} onClose={() => setShowEdit(false)} />}
      {txnModal && (
        <AddTransactionModal customerId={id} defaultType={txnModal} onClose={() => setTxnModal(null)} />
      )}
      {showStatement && customer && <StatementModal customer={customer} onClose={() => setShowStatement(false)} />}
    </div>
  )
}
