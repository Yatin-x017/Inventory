import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function ProtectedRoute({ children, requireManage = false, requireCustomers = false }) {
  const { session, loading, canManageInventory, canManageCustomers } = useAuth()

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" />
      </div>
    )
  }
  if (!session) return <Navigate to="/login" replace />
  if (requireManage && !canManageInventory) return <Navigate to="/" replace />
  if (requireCustomers && !canManageCustomers) return <Navigate to="/" replace />

  return children
}
