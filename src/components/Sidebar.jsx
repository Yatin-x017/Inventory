import { NavLink, useNavigate } from 'react-router-dom'
import { LogOut, X, Languages } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useLanguage, LANGUAGES } from '../context/LanguageContext'
import { NAV_ITEMS } from '../lib/nav'

function Initials({ name }) {
  const initials = (name || '?')
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-white">
      {initials}
    </div>
  )
}

export default function Sidebar({ onNavigate }) {
  const { profile, role, canManageInventory, canManageCustomers, isOwner, signOut } = useAuth()
  const { language, setLanguage, t } = useLanguage()
  const navigate = useNavigate()

  async function handleSignOut() {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex items-center justify-between px-2 pb-6 pt-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent text-[17px] shadow-sm">
            📱
          </div>
          <div className="min-w-0 leading-tight">
            <div className="text-headline truncate text-[15px] font-semibold">{t('sidebar.appName')}</div>
            <div className="truncate text-[11px] font-medium text-muted">{t('sidebar.appTagline')}</div>
          </div>
        </div>
        <button
          onClick={onNavigate}
          className="rounded-md p-2 text-muted hover:bg-accent-soft hover:text-text lg:hidden"
          aria-label={t('sidebar.closeMenu')}
        >
          <X size={20} />
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {NAV_ITEMS.filter(
          (item) =>
            (!item.requireManage || canManageInventory) &&
            (!item.requireCustomers || canManageCustomers) &&
            (!item.requireOwner || isOwner)
        ).map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                [
                  'group relative flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-[13.5px] font-medium transition-colors',
                  isActive ? 'text-accent' : 'text-muted hover:bg-accent-soft hover:text-text',
                ].join(' ')
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && <span className="absolute inset-0 -z-10 rounded-xl bg-accent-soft" />}
                  {isActive && (
                    <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-accent" />
                  )}
                  <Icon size={17} strokeWidth={2} />
                  {t(item.labelKey)}
                </>
              )}
            </NavLink>
          )
        })}
      </nav>

      <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">

        <div className="flex items-center justify-between rounded-lg px-3 py-2 text-[13px] font-medium text-muted">
          <span className="flex items-center gap-2.5">
            <Languages size={16} />
            {t('sidebar.language')}
          </span>
          <div className="flex overflow-hidden rounded-full border border-border text-[11.5px] font-semibold">
            {LANGUAGES.map((lng) => (
              <button
                key={lng.code}
                onClick={() => setLanguage(lng.code)}
                className={[
                  'px-2.5 py-1 transition-colors',
                  language === lng.code ? 'bg-accent text-white' : 'text-muted hover:bg-accent-soft hover:text-text',
                ].join(' ')}
              >
                {lng.code.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 rounded-lg px-3 py-2">
          <Initials name={profile?.full_name} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium leading-tight">{profile?.full_name || t('common.none')}</div>
            <div className="truncate text-[11.5px] capitalize leading-tight text-muted">{role}</div>
          </div>
          <button
            onClick={handleSignOut}
            className="rounded-md p-1.5 text-muted transition-colors hover:bg-danger-soft hover:text-danger"
            title={t('sidebar.signOut')}
            aria-label={t('sidebar.signOut')}
          >
            <LogOut size={15} />
          </button>
        </div>
      </div>
    </div>
  )
}
