import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'

const Login = lazy(() => import('./pages/Login'))
const Dashboard = lazy(() => import('./pages/Dashboard'))
const MissingItems = lazy(() => import('./pages/MissingItems'))
const ManageInventory = lazy(() => import('./pages/ManageInventory'))
const Users = lazy(() => import('./pages/Users'))
const Customers = lazy(() => import('./pages/Customers'))
const CustomerDetail = lazy(() => import('./pages/CustomerDetail'))
const PayLaterCustomers = lazy(() => import('./pages/PayLaterCustomers'))
const Billing = lazy(() => import('./pages/Billing'))
const BillLogs = lazy(() => import('./pages/BillLogs'))
const Backups = lazy(() => import('./pages/Backups'))
const Repairs = lazy(() => import('./pages/Repairs'))
const Suppliers = lazy(() => import('./pages/Suppliers'))
const SupplierDetail = lazy(() => import('./pages/SupplierDetail'))

function PageFallback() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-border border-t-accent" />
    </div>
  )
}

export default function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Layout><Dashboard /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/missing"
          element={
            <ProtectedRoute>
              <Layout><MissingItems /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/billing"
          element={
            <ProtectedRoute>
              <Layout><Billing /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/bill-logs"
          element={
            <ProtectedRoute>
              <Layout><BillLogs /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/manage"
          element={
            <ProtectedRoute requireManage>
              <Layout><ManageInventory /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/users"
          element={
            <ProtectedRoute requireManage>
              <Layout><Users /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers"
          element={
            <ProtectedRoute requireCustomers>
              <Layout><Customers /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/customers/:id"
          element={
            <ProtectedRoute requireCustomers>
              <Layout><CustomerDetail /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/pay-later"
          element={
            <ProtectedRoute requireCustomers>
              <Layout><PayLaterCustomers /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/repairs"
          element={
            <ProtectedRoute>
              <Layout><Repairs /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/backups"
          element={
            <ProtectedRoute requireOwner>
              <Layout><Backups /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers"
          element={
            <ProtectedRoute requireManage>
              <Layout><Suppliers /></Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/suppliers/:id"
          element={
            <ProtectedRoute requireManage>
              <Layout><SupplierDetail /></Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </Suspense>
  )
}
