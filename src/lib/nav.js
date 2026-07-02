import { LayoutDashboard, PackageSearch, ClipboardList, Users, Wallet, Receipt } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/billing', labelKey: 'nav.billing', icon: Receipt },
  { to: '/manage', labelKey: 'nav.inventory', icon: PackageSearch, requireManage: true },
  { to: '/missing', labelKey: 'nav.missingItems', icon: ClipboardList },
  { to: '/customers', labelKey: 'nav.customers', icon: Wallet, requireCustomers: true },
  { to: '/users', labelKey: 'nav.staff', icon: Users, requireOwner: true },
]
