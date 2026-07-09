import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requireManage = false, requireCustomers = false, requireOwner = false }) {
  const { session, loading, noAccount, canManageInventory, canManageCustomers, isOwner } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (noAccount) return <Navigate to="/login?error=no-account" replace />
  if (requireManage && !canManageInventory) return <Navigate to="/" replace />
  if (requireCustomers && !canManageCustomers) return <Navigate to="/" replace />
  if (requireOwner && !isOwner) return <Navigate to="/" replace />

  return children
}
