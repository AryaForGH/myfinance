import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { AuthContext } from './AuthContext.js'

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [authError, setAuthError] = useState('')

  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (active) {
        setSession(nextSession)
        setLoading(false)
      }
    })

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return
      if (error) setAuthError(error.message)
      setSession(data.session)
      setLoading(false)
    }).catch((error) => {
      if (!active) return
      setAuthError(error.message || 'Could not restore your sign-in session.')
      setLoading(false)
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])

  const runAuth = useCallback(async (operation) => {
    setAuthError('')
    const { data, error } = await operation()
    if (error) {
      setAuthError(error.message)
      throw error
    }
    return data
  }, [])

  const value = useMemo(() => ({
    session,
    user: session?.user ?? null,
    loading,
    authError,
    clearAuthError: () => setAuthError(''),
    signIn: (email, password) => runAuth(() => supabase.auth.signInWithPassword({ email, password })),
    signUp: (fullName, email, password) => runAuth(() => supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    })),
    signOut: () => runAuth(() => supabase.auth.signOut()),
    resetPassword: (email) => runAuth(() => supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/?reset-password=1`,
    })),
    updatePassword: (password) => runAuth(() => supabase.auth.updateUser({ password })),
  }), [session, loading, authError, runAuth])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
