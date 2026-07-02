import { NavLink, useLocation } from 'react-router-dom'
import { Menu } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage } from '../context/LanguageContext'
import { NAV_ITEMS } from '../lib/nav'

const MAX_TABS = 4

// Bottom tab bar — the primary way to move around the app on a phone.
// A hamburger menu tucked in a corner is a reach-and-tap-twice pattern;
// putting the top few destinations within thumb range (plus a "More" tab
// for everything else) is the mobile-native way to do the same job.
export default function MobileTabBar({ onOpenMore }) {
  const { canManageInventory, canManageCustomers, isOwner } = useAuth()
  const { t } = useLanguage()
  const location = useLocation()

  const visibleItems = NAV_ITEMS.filter(
    (item) =>
      (!item.requireManage || canManageInventory) &&
      (!item.requireCustomers || canManageCustomers) &&
      (!item.requireOwner || isOwner)
  )

  const tabs = visibleItems.slice(0, MAX_TABS)
  const overflowActive = visibleItems
    .slice(MAX_TABS)
    .some((item) => (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to)))

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 flex items-stretch justify-around border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      aria-label={t('sidebar.appName')}
    >
      {tabs.map((item) => {
        const Icon = item.icon
        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              [
                'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors',
                isActive ? 'text-accent' : 'text-muted',
              ].join(' ')
            }
          >
            {({ isActive }) => (
              <>
                <Icon size={20} strokeWidth={isActive ? 2.3 : 2} />
                <span className="truncate">{t(item.labelKey)}</span>
              </>
            )}
          </NavLink>
        )
      })}
      <button
        type="button"
        onClick={onOpenMore}
        className={[
          'flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[10.5px] font-medium transition-colors',
          overflowActive ? 'text-accent' : 'text-muted',
        ].join(' ')}
      >
        <Menu size={20} strokeWidth={overflowActive ? 2.3 : 2} />
        <span className="truncate">{t('nav.more')}</span>
      </button>
    </nav>
  )
}
