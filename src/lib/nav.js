import { LayoutDashboard, PackageSearch, ClipboardList, Users, Wallet, Receipt, Clock, History, DatabaseBackup, Wrench, Truck } from 'lucide-react'

export const NAV_ITEMS = [
  { to: '/', labelKey: 'nav.dashboard', icon: LayoutDashboard, end: true },
  { to: '/billing', labelKey: 'nav.billing', icon: Receipt },
  { to: '/bill-logs', labelKey: 'nav.billLogs', icon: History },
  { to: '/manage', labelKey: 'nav.inventory', icon: PackageSearch, requireManage: true },
  { to: '/missing', labelKey: 'nav.missingItems', icon: ClipboardList },
  { to: '/repairs', labelKey: 'nav.repairs', icon: Wrench },
  { to: '/suppliers', labelKey: 'nav.suppliers', icon: Truck, requireManage: true },
  { to: '/customers', labelKey: 'nav.customers', icon: Wallet, requireCustomers: true },
  { to: '/pay-later', labelKey: 'nav.payLater', icon: Clock, requireCustomers: true },
  { to: '/users', labelKey: 'nav.staff', icon: Users, requireOwner: true },
  { to: '/backups', labelKey: 'nav.backups', icon: DatabaseBackup, requireOwner: true },
]
