import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from './AuthContext.js'
import { PreferencesContext } from './PreferencesContext.js'
import { supabase } from '../lib/supabase.js'
import { LANGUAGES, CURRENCIES } from '../lib/preferences.js'

const DEFAULT_PREFERENCES = { full_name: '', language: 'id', currency: 'IDR' }
const PROFILE_PREFERENCES_MIGRATION_REQUIRED = 'PROFILE_PREFERENCES_MIGRATION_REQUIRED'

function isMissingPreferenceColumn(error) {
  return error?.code === 'PGRST204'
    || /could not find the ['"]?(language|currency)['"]? column of ['"]?profiles['"]? in the schema cache/i.test(error?.message || '')
}

export function PreferencesProvider({ children }) {
  const { user } = useAuth()
  const [profileState, setProfileState] = useState({ ownerId: null, preferences: DEFAULT_PREFERENCES, error: '' })
  const ready = Boolean(user && profileState.ownerId === user.id)
  const preferences = ready ? profileState.preferences : DEFAULT_PREFERENCES
  const loading = Boolean(user && !ready)
  const error = ready ? profileState.error : ''

  useEffect(() => {
    let active = true
    if (!user) return undefined
    supabase.from('profiles')
      .select('id, full_name, email, language, currency')
      .eq('id', user.id)
      .single()
      .then(({ data, error: queryError }) => {
        if (!active) return
        if (queryError) {
          if (isMissingPreferenceColumn(queryError)) {
            supabase.from('profiles')
              .select('id, full_name, email')
              .eq('id', user.id)
              .single()
              .then(({ data: legacyProfile, error: legacyError }) => {
                if (!active) return
                setProfileState({
                  ownerId: user.id,
                  preferences: {
                    ...DEFAULT_PREFERENCES,
                    full_name: legacyProfile?.full_name || user.user_metadata?.full_name || '',
                  },
                  error: legacyError
                    ? legacyError.message || 'Could not load your profile settings.'
                    : PROFILE_PREFERENCES_MIGRATION_REQUIRED,
                })
              })
              .catch((legacyError) => {
                if (active) {
                  setProfileState({
                    ownerId: user.id,
                    preferences: {
                      ...DEFAULT_PREFERENCES,
                      full_name: user.user_metadata?.full_name || '',
                    },
                    error: legacyError.message || 'Could not load your profile settings.',
                  })
                }
              })
            return
          }
          setProfileState({
            ownerId: user.id,
            preferences: DEFAULT_PREFERENCES,
            error: queryError.message || 'Could not load your profile settings.',
          })
          return
        }
        setProfileState({
          ownerId: user.id,
          preferences: {
            full_name: data.full_name || '',
            language: LANGUAGES.some((item) => item.code === data.language) ? data.language : 'id',
            currency: CURRENCIES.some((item) => item.code === data.currency) ? data.currency : 'IDR',
          },
          error: '',
        })
      })
      .catch((queryError) => {
        if (active) {
          setProfileState({
            ownerId: user.id,
            preferences: DEFAULT_PREFERENCES,
            error: queryError.message || 'Could not load your profile settings.',
          })
        }
      })
    return () => { active = false }
  }, [user])

  const updateProfile = useCallback(async (fullName) => {
    if (!user) throw new Error('Sign in to change your preferences.')
    const { data, error: updateError } = await supabase.from('profiles')
      .update({ full_name: fullName.trim() })
      .eq('id', user.id)
      .select('full_name')
      .single()
    if (updateError) {
      throw updateError
    }
    setProfileState((current) => ({
      ownerId: user.id,
      preferences: { ...current.preferences, ...data },
      error: current.error,
    }))
    return data
  }, [user])

  const updatePreference = useCallback(async (column, value) => {
    if (!user) throw new Error('Sign in to change your preferences.')
    if (error === PROFILE_PREFERENCES_MIGRATION_REQUIRED) {
      throw new Error(PROFILE_PREFERENCES_MIGRATION_REQUIRED)
    }
    const { data, error: updateError } = await supabase.from('profiles')
      .update({ [column]: value })
      .eq('id', user.id)
      .select(column)
      .single()
    if (updateError) {
      if (isMissingPreferenceColumn(updateError)) {
        setProfileState((current) => ({ ...current, error: PROFILE_PREFERENCES_MIGRATION_REQUIRED }))
        throw new Error(PROFILE_PREFERENCES_MIGRATION_REQUIRED)
      }
      throw updateError
    }
    setProfileState((current) => ({
      ownerId: user.id,
      preferences: { ...current.preferences, ...data },
      error: '',
    }))
    return data
  }, [user, error])

  const value = useMemo(() => ({
    preferences,
    loading,
    error,
    updateProfile,
    updateLanguage: (language) => updatePreference('language', language),
    updateCurrency: (currency) => updatePreference('currency', currency),
  }), [preferences, loading, error, updateProfile, updatePreference])

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}
