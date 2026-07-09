import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import Sidebar from './Sidebar'
import MobileTabBar from './MobileTabBar'
import CreateBillModal from './CreateBillModal'
import ReceiptModal from './ReceiptModal'
import { useLanguage } from '../context/LanguageContext'
import { useStore } from '../store/useStore'
import { useGlobalScanListener } from '../hooks/useScanListener'

export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [receipt, setReceipt] = useState(null)
  const location = useLocation()
  const { t } = useLanguage()
  const { quickBillOpen, quickBillQuery, quickBillNonce, openQuickBill, closeQuickBill } = useStore()

  // A scan anywhere in the app — dashboard, inventory, wherever, as long as
  // focus isn't already inside some other form — jumps straight into a new
  // bill with the scanned code pre-loaded.
  useGlobalScanListener(openQuickBill)

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileOpen) return
    const scrollY = window.scrollY
    const body = document.body
    const original = {
      position: body.style.position,
      top: body.style.top,
      left: body.style.left,
      right: body.style.right,
      overflow: body.style.overflow,
      width: body.style.width,
    }
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.left = '0'
    body.style.right = '0'
    body.style.width = '100%'
    body.style.overflow = 'hidden'
    return () => {
      body.style.position = original.position
      body.style.top = original.top
      body.style.left = original.left
      body.style.right = original.right
      body.style.overflow = original.overflow
      body.style.width = original.width
      window.scrollTo(0, scrollY)
    }
  }, [mobileOpen])

  return (
    <>
    <div className="relative min-h-screen overflow-x-hidden bg-bg text-text print:hidden">
      {/* A single, quiet accent glow — restraint over decoration */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[460px] w-[460px] rounded-full bg-accent/[0.06] blur-[130px]" />
      </div>

      {/* Desktop floating sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[280px] p-4 lg:block">
        <div className="glass h-full rounded-3xl border border-border p-4 shadow-float">
          <Sidebar />
        </div>
      </aside>

      {/* Mobile topbar — branding only. Navigation lives in the bottom tab
          bar, within thumb reach, instead of behind a corner hamburger. */}
      <header className="glass sticky top-0 z-20 flex items-center border-b border-border px-4 py-3 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm">
            📱
          </div>
          <span className="text-headline text-sm font-semibold">{t('sidebar.appName')}</span>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
              className="fixed inset-0 z-40 overscroll-contain bg-black/40 lg:hidden"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 28, stiffness: 280 }}
              className="fixed inset-y-0 left-0 z-50 w-[260px] overscroll-contain bg-surface p-4 shadow-2xl lg:hidden"
            >
              <Sidebar onNavigate={() => setMobileOpen(false)} />
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="px-4 py-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:ml-[280px] lg:px-8 lg:py-8 lg:pb-8">
        <div className="mx-auto max-w-6xl animate-fade-in">{children}</div>
      </main>

      <MobileTabBar onOpenMore={() => setMobileOpen(true)} />

      {quickBillOpen && (
        <CreateBillModal
          key={quickBillNonce}
          initialQuery={quickBillQuery}
          onClose={closeQuickBill}
          onCreated={(sale) => {
            toast.success('Sale completed')
            setReceipt(sale)
          }}
        />
      )}
    </div>

    {receipt && <ReceiptModal receipt={receipt} onClose={() => setReceipt(null)} />}
    </>
  )
}
