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
} from 'lucide-react'
import { useCustomerStore } from '../store/useCustomerStore'
import Button from '../components/ui/Button'
import Badge from '../components/ui/Badge'
import EmptyState from '../components/ui/EmptyState'
import AddCustomerModal from '../components/AddCustomerModal'
import AddTransactionModal from '../components/AddTransactionModal'

function formatMoney(n) {
  return `₹${Number(n || 0).toLocaleString('en-IN')}`
}

function formatDate(d) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function CustomerDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { customers, transactions, transactionsLoading, fetchCustomers, fetchTransactions, deleteCustomer, deleteTransaction } =
    useCustomerStore()
  const [showEdit, setShowEdit] = useState(false)
  const [txnModal, setTxnModal] = useState(null) // 'udhar' | 'payment' | null

  useEffect(() => {
    if (customers.length === 0) fetchCustomers()
    fetchTransactions(id)
  }, [id])

  const customer = customers.find((c) => c.id === id)

  const balance = useMemo(() => {
    return transactions.reduce((sum, t) => {
      const sign = t.type === 'udhar' || t.type === 'paid_out' ? 1 : -1
      return sum + sign * t.amount
    }, 0)
  }, [transactions])

  async function handleDeleteCustomer() {
    if (!confirm(`Delete ${customer?.name}? This removes their entire ledger too.`)) return
    try {
      await deleteCustomer(id)
      toast.success('Customer deleted')
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
      <EmptyState icon={Receipt} title="Customer not found" description="It may have been deleted." />
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <button
        onClick={() => navigate('/customers')}
        className="flex w-fit items-center gap-1.5 text-[13px] font-medium text-muted transition-colors hover:text-text"
      >
        <ArrowLeft size={15} /> Back to customers
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
          </div>
          {customer?.notes && <p className="mt-2 text-[12.5px] text-muted">{customer.notes}</p>}
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
        <h2 className="mb-3 text-[15px] font-semibold">Ledger</h2>

        {transactionsLoading && <p className="text-[13px] text-muted">Loading transactions…</p>}

        {!transactionsLoading && transactions.length === 0 && (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Add an udhar entry or record a payment to start this customer's ledger."
          />
        )}

        {transactions.length > 0 && (
          <div className="flex flex-col gap-2">
            {transactions.map((t) => {
              const meta = {
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
              }[t.type]
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
    </div>
  )
}
