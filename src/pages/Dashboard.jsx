import { useEffect, useMemo, useState } from 'react'
import {
  Package,
  Users as UsersIcon,
  AlertTriangle,
  Boxes,
  Clock,
  Wallet,
  Receipt,
  IndianRupee,
  Tag as TagIcon,
} from 'lucide-react'
import { useStore } from '../store/useStore'
import { useCustomerStore } from '../store/useCustomerStore'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { supabase } from '../lib/supabase'
import { getGreetingKey } from '../lib/greeting'
import SearchBar from '../components/SearchBar'
import ItemCard from '../components/ItemCard'
import ItemDetailModal from '../components/ItemDetailModal'
import AddItemModal from '../components/AddItemModal'
import StatCard from '../components/ui/StatCard'
import EmptyState from '../components/ui/EmptyState'
import SplitText from '../components/ui/SplitText'
import AnimatedNumber from '../components/ui/AnimatedNumber'
import { CategoryPieChart, LocationBarChart } from '../components/charts/Charts'

const PALETTE = ['#0071E3', '#10B981', '#F97316', '#8B5CF6', '#06B6D4', '#EC4899', '#EF4444', '#84CC16']
const LOW_STOCK_THRESHOLD = 2

export default function Dashboard() {
  const { items, products, inventoryUnits, tags, bills, fetchAll, fetchBills, searchItems, loading } = useStore()
  const { customers, fetchCustomers } = useCustomerStore()
  const { profile, isOwner } = useAuth()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [tagFilter, setTagFilter] = useState(null)
  const [staffCount, setStaffCount] = useState(null)
  const [pendingMissing, setPendingMissing] = useState(null)
  const [recentMissing, setRecentMissing] = useState([])
  const [selectedResult, setSelectedResult] = useState(null) // { kind: 'legacy', item } | { kind: 'serialized', product, units }
  const [editingItem, setEditingItem] = useState(null)

  useEffect(() => {
    fetchAll()
    fetchBills().catch(() => {})
    fetchCustomers().catch(() => {})
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .then(({ count }) => setStaffCount(count ?? null))
    supabase
      .from('missing_items')
      .select('id, item_name, status, created_at', { count: 'exact' })
      .eq('status', 'pending')
      .then(({ count }) => setPendingMissing(count ?? null))
    supabase
      .from('missing_items')
      .select('id, item_name, status, created_at')
      .order('created_at', { ascending: false })
      .limit(4)
      .then(({ data }) => setRecentMissing(data ?? []))
  }, [])

  // Tags only exist on the legacy items table, so a tag filter narrows to
  // legacy results only; with no tag filter, serialized products are
  // searched alongside items using the same plain-text query.
  const results = useMemo(() => {
    const legacyResults = searchItems(query, tagFilter).map((item) => ({ kind: 'legacy', item }))
    if (tagFilter) return legacyResults

    const q = query.trim().toLowerCase()
    const serializedResults = products
      .filter((p) => {
        if (!q) return true
        const label = [p.brand, p.model, p.color].filter(Boolean).join(' ').toLowerCase()
        return label.includes(q) || p.sku?.toLowerCase().includes(q) || p.brand?.toLowerCase().includes(q)
      })
      .map((product) => ({
        kind: 'serialized',
        product,
        units: inventoryUnits.filter((u) => u.product_id === product.id),
      }))

    return [...serializedResults, ...legacyResults]
  }, [items, products, inventoryUnits, query, tagFilter, searchItems])

  const totalStock = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (item.item_locations ?? []).reduce((s, l) => s + (l.quantity || 0), 0),
        0
      ),
    [items]
  )

  const inventoryValue = useMemo(
    () =>
      items.reduce((sum, item) => {
        const qty = (item.item_locations ?? []).reduce((s, l) => s + (l.quantity || 0), 0)
        return sum + (item.price || 0) * qty
      }, 0),
    [items]
  )

  const activeBills = useMemo(
    () => bills.filter((b) => b.status !== 'void' && !b.voided),
    [bills]
  )

  const billsToday = useMemo(
    () => activeBills.filter((b) => new Date(b.created_at).toDateString() === new Date().toDateString()),
    [activeBills]
  )

  // Cash actually collected today — sums each bill's paid_amount, not the
  // full sale total. A pay-later sale (e.g. ₹79,899 total, ₹20,031 paid
  // now, ₹59,868 due) should only contribute the ₹20,031 that was
  // actually received, not the whole line-item total.
  const todayRevenue = useMemo(
    () => billsToday.reduce((sum, b) => sum + Number(b.paid_amount ?? b.total ?? 0), 0),
    [billsToday]
  )

  const outstandingTotal = useMemo(
    () => customers.reduce((sum, c) => sum + Math.max(0, c.balance || 0), 0),
    [customers]
  )

  const lowStockCount = useMemo(
    () =>
      items.filter((item) => {
        const qty = (item.item_locations ?? []).reduce((s, l) => s + (l.quantity || 0), 0)
        return qty > 0 && qty <= LOW_STOCK_THRESHOLD
      }).length,
    [items]
  )

  const tagChartData = useMemo(() => {
    const counts = new Map()
    items.forEach((item) => {
      ;(item.item_tags ?? []).forEach((it) => {
        const name = it.tags?.name
        if (!name) return
        counts.set(name, (counts.get(name) || 0) + 1)
      })
    })
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
  }, [items])

  const locationChartData = useMemo(() => {
    const counts = new Map()
    items.forEach((item) => {
      ;(item.item_locations ?? []).forEach((l) => {
        const type = l.locations?.type
        if (!type) return
        counts.set(type, (counts.get(type) || 0) + 1)
      })
    })
    return [...counts.entries()]
      .map(([name, value]) => ({ name: name[0].toUpperCase() + name.slice(1), value }))
      .sort((a, b) => b.value - a.value)
  }, [items])

  const recentItems = useMemo(
    () =>
      [...items]
        .filter((i) => i.created_at)
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(0, 4),
    [items]
  )

  const activity = useMemo(() => {
    const fromItems = recentItems.map((i) => ({
      key: `item-${i.id}`,
      text: t('dashboard.addedToInventory', { name: i.name }),
      at: i.created_at,
    }))
    const fromMissing = recentMissing.map((m) => ({
      key: `missing-${m.id}`,
      text: t('dashboard.loggedAsMissing', { name: m.item_name }),
      at: m.created_at,
    }))
    const fromBills = activeBills.slice(0, 3).map((b) => ({
      key: `bill-${b.id}`,
      text: `Invoice created for ${b.customer_name || 'a walk-in customer'}`,
      at: b.created_at,
    }))
    return [...fromItems, ...fromMissing, ...fromBills]
      .filter((a) => a.at)
      .sort((a, b) => new Date(b.at) - new Date(a.at))
      .slice(0, 5)
  }, [recentItems, recentMissing, activeBills, t])

  // Real, computed insights — not fabricated AI copy. Only surfaces when
  // there is something worth saying.
  const insights = useMemo(() => {
    const out = []
    if (tagChartData[0]) {
      out.push({
        icon: '🏷',
        text: `${tagChartData[0].name} is your most common tag, with ${tagChartData[0].value} item${tagChartData[0].value === 1 ? '' : 's'}.`,
      })
    }
    if (lowStockCount > 0) {
      out.push({
        icon: '⚠',
        text: `${lowStockCount} item${lowStockCount === 1 ? ' is' : 's are'} running low — ${LOW_STOCK_THRESHOLD} or fewer in stock.`,
      })
    }
    if (outstandingTotal > 0) {
      out.push({
        icon: '💰',
        text: `Customers owe ₹${Math.round(outstandingTotal).toLocaleString('en-IN')} in outstanding balances.`,
      })
    }
    return out.slice(0, 3)
  }, [tagChartData, lowStockCount, outstandingTotal])

  const firstName = profile?.full_name?.split(' ')[0] || t('greeting.there')

  return (
    <div className="flex flex-col gap-6">
      {/* Hero — greeting + the one animated signature moment on this page */}
      <div className="order-1 glass flex flex-col gap-6 rounded-3xl border border-border p-6 shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div>
          <h1 className="text-headline text-[24px] font-semibold sm:text-[28px]">
            <SplitText text={`${t(getGreetingKey())}, ${firstName} 👋`} />
          </h1>
          <p className="mt-1.5 text-[13.5px] text-muted">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 rounded-2xl bg-accent-soft px-5 py-4">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-white">
            <IndianRupee size={18} strokeWidth={2.2} />
          </span>
          <div>
            <div className="text-[12px] font-medium text-muted">Today's revenue</div>
            <div className="text-headline text-[26px] font-semibold leading-none text-accent">
              <AnimatedNumber value={todayRevenue} prefix="₹" />
            </div>
          </div>
        </div>
      </div>

      {/* Stat strip — on phones this swipes horizontally instead of stacking
          into four tall rows, so the page doesn't front-load a huge scroll
          before anything actionable (search, item list) is reachable. */}
      <div className="order-3 lg:order-2">
        <div className="no-scrollbar -mx-4 flex snap-x snap-proximity gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-4">
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={Boxes}
            label="Inventory value"
            value={`₹${inventoryValue.toLocaleString('en-IN')}`}
            hint="Selling price × stock on hand"
            tone="accent"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={Package}
            label={t('dashboard.totalInventory')}
            value={items.length}
            hint={t('dashboard.totalInventoryHint')}
            tone="accent"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={Receipt}
            label="Bills today"
            value={billsToday.length}
            hint={`${activeBills.length} total invoices`}
            tone="success"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={Boxes}
            label={t('dashboard.totalStock')}
            value={totalStock}
            hint={t('dashboard.totalStockHint')}
            tone="success"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={AlertTriangle}
            label={t('dashboard.missingPending')}
            value={pendingMissing ?? t('common.none')}
            hint={t('dashboard.missingPendingHint')}
            tone="warning"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={Wallet}
            label="Outstanding"
            value={`₹${Math.round(outstandingTotal).toLocaleString('en-IN')}`}
            hint="Owed across all customers"
            tone="warning"
          />
          <StatCard
            className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
            icon={UsersIcon}
            label="Customers"
            value={customers.length}
            hint="On record"
            tone="accent"
          />
          {isOwner ? (
            <StatCard
              className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
              icon={UsersIcon}
              label={t('dashboard.staff')}
              value={staffCount ?? t('common.none')}
              hint={t('dashboard.staffHint')}
              tone="accent"
            />
          ) : (
            <StatCard
              className="min-w-[46%] shrink-0 snap-start sm:min-w-0 sm:shrink"
              icon={TagIcon}
              label={t('dashboard.tags')}
              value={tags.length}
              hint={t('dashboard.tagsHint')}
              tone="accent"
            />
          )}
        </div>
      </div>

      <div className="order-5 grid grid-cols-1 gap-4 lg:order-3 lg:grid-cols-5">
        <div className="glass rounded-2xl border border-border p-5 shadow-card lg:col-span-3">
          <h2 className="mb-1 text-[14px] font-semibold">{t('dashboard.inventoryByTag')}</h2>
          <p className="mb-2 text-[12.5px] text-muted">{t('dashboard.inventoryByTagSubtitle')}</p>
          {tagChartData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">{t('dashboard.noTagsYet')}</p>
          ) : (
            <div className="flex flex-col items-center gap-4 sm:flex-row">
              <div className="w-full sm:w-1/2">
                <CategoryPieChart data={tagChartData} />
              </div>
              <ul className="flex w-full flex-col gap-2 sm:w-1/2">
                {tagChartData.map((d, i) => (
                  <li key={d.name} className="flex items-center justify-between text-[12.5px]">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: PALETTE[i % PALETTE.length] }}
                      />
                      {d.name}
                    </span>
                    <span className="font-medium text-muted">{d.value}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="glass rounded-2xl border border-border p-5 shadow-card lg:col-span-2">
          <h2 className="mb-1 text-[14px] font-semibold">{t('dashboard.recentActivity')}</h2>
          <p className="mb-3 text-[12.5px] text-muted">{t('dashboard.recentActivitySubtitle')}</p>
          {activity.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-muted">{t('dashboard.nothingYet')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {activity.map((a) => (
                <li key={a.key} className="flex items-start gap-2.5 text-[13px]">
                  <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
                    <Clock size={11} />
                  </span>
                  <span className="leading-snug text-text">{a.text}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {insights.length > 0 && (
        <div className="order-6 glass rounded-2xl border border-border p-5 shadow-card lg:order-4">
          <h2 className="mb-3 text-[14px] font-semibold">Smart insights</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {insights.map((insight, i) => (
              <div key={i} className="flex items-start gap-2.5 rounded-xl bg-bg px-3.5 py-3 text-[13px] leading-snug">
                <span aria-hidden>{insight.icon}</span>
                <span>{insight.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {locationChartData.length > 0 && (
        <div className="order-7 glass rounded-2xl border border-border p-5 shadow-card lg:order-5">
          <h2 className="mb-1 text-[14px] font-semibold">{t('dashboard.itemsByLocation')}</h2>
          <p className="mb-2 text-[12.5px] text-muted">{t('dashboard.itemsByLocationSubtitle')}</p>
          <LocationBarChart data={locationChartData} />
        </div>
      )}

      {/* Find an item — the thing people actually open this app to do. On
          phones it sits right under the hero, ahead of every stat/chart, so
          it doesn't take a long scroll to reach; desktop keeps its original
          spot since there's already room to see everything at once. */}
      <div className="order-2 lg:order-8">
        <h2 className="mb-3 text-[15px] font-semibold">{t('dashboard.findAnItem')}</h2>
        <SearchBar items={items} products={products} inventoryUnits={inventoryUnits} query={query} setQuery={setQuery} />

        <div className="mb-5 mt-3 flex flex-wrap gap-2">
          <button
            className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
              !tagFilter
                ? 'border-accent bg-accent-soft text-accent'
                : 'border-border text-muted hover:text-text'
            }`}
            onClick={() => setTagFilter(null)}
          >
            {t('common.all')}
          </button>
          {tags.map((tag) => (
            <button
              key={tag.id}
              className={`rounded-full border px-3 py-1.5 text-[12.5px] font-medium transition-colors ${
                tagFilter === tag.id
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-border text-muted hover:text-text'
              }`}
              onClick={() => setTagFilter(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>

        {loading && <p className="text-[13px] text-muted">{t('dashboard.loadingInventory')}</p>}

        {!loading && results.length === 0 ? (
          <EmptyState
            icon={Package}
            title={t('dashboard.noItemsFound')}
            description={t('dashboard.noItemsFoundDescription')}
          />
        ) : (
          <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
            {results.map((result, i) => {
              const key = result.kind === 'legacy' ? `legacy-${result.item.id}` : `product-${result.product.id}`
              return (
                <div key={key} className="animate-pop-in" style={{ animationDelay: `${Math.min(i, 8) * 35}ms` }}>
                  {result.kind === 'legacy' ? (
                    <ItemCard item={result.item} onClick={() => setSelectedResult(result)} />
                  ) : (
                    <ItemCard product={result.product} units={result.units} onClick={() => setSelectedResult(result)} />
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {selectedResult?.kind === 'legacy' && (
        <ItemDetailModal
          item={items.find((i) => i.id === selectedResult.item.id) ?? selectedResult.item}
          onClose={() => setSelectedResult(null)}
          onEdit={() => {
            setEditingItem(selectedResult.item)
            setSelectedResult(null)
          }}
        />
      )}

      {selectedResult?.kind === 'serialized' && (
        <ItemDetailModal
          product={selectedResult.product}
          units={inventoryUnits.filter((u) => u.product_id === selectedResult.product.id)}
          onClose={() => setSelectedResult(null)}
        />
      )}

      {editingItem && (
        <AddItemModal item={editingItem} onClose={() => setEditingItem(null)} />
      )}
    </div>
  )
}
