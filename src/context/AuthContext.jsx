import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [profileChecked, setProfileChecked] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setProfileChecked(true)
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session)
      if (session) await loadProfile(session.user.id)
      setLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session)
      if (session) {
        await loadProfile(session.user.id)
      } else {
        setProfile(null)
        setProfileChecked(false)
      }
    })

    return () => listener.subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  // Redirects to Google, then back to this same origin. The actual
  // provider (Client ID/secret + authorized redirect URI) is configured in
  // the Supabase dashboard under Authentication → Providers → Google — no
  // code-side keys needed here. Requires an existing `profiles` row for
  // the signed-in Google account's user id; see the "no-account" handling
  // in ProtectedRoute/Login for what happens if one doesn't exist yet.
  async function signInWithGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) throw error
  }

  async function signOut() {
    await supabase.auth.signOut()
  }

  const role = profile?.role ?? null
  const canManageInventory = role === 'owner' || role === 'builder'
  // Customers (udhar ledger) tier: owner/builder see and manage every
  // retailer; a marketing_member only sees retailers assigned to them
  // (enforced at the RLS level — see 20260707_customer_hierarchy_and_statements.sql).
  const canManageCustomers = role === 'owner' || role === 'builder' || role === 'marketing_member'
  const isOwner = role === 'owner'
  // Owner/builder is the "top tier" that can see every retailer and
  // reassign them between marketing members; a marketing_member is
  // scoped to their own book.
  const isTopTierCustomers = role === 'owner' || role === 'builder'
  const isMarketingMember = role === 'marketing_member'
  // A Supabase auth user with no matching `profiles` row — e.g. someone
  // signed in with Google whose email the owner hasn't added as staff yet
  // (see Users.jsx). Treated as unauthorized, not "still loading".
  const noAccount = Boolean(session) && profileChecked && !profile

  return (
    <AuthContext.Provider
      value={{
        session,
        profile,
        role,
        loading,
        noAccount,
        signIn,
        signInWithGoogle,
        signOut,
        canManageInventory,
        canManageCustomers,
        isOwner,
        isTopTierCustomers,
        isMarketingMember,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
