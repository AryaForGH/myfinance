import { useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.js'
import { useI18n } from '../context/I18nContext.js'
import { usePreferences } from '../context/PreferencesContext.js'
import { useToast } from '../context/useToast.js'
import { CURRENCIES, currencyLabel, LANGUAGES } from '../lib/preferences.js'
import './ProfileSettings.css'

const PROFILE_PREFERENCES_MIGRATION_REQUIRED = 'PROFILE_PREFERENCES_MIGRATION_REQUIRED'

function ProfileSettings({ onSignOut }) {
  const { user, updatePassword } = useAuth()
  const { t } = useI18n()
  const { notify } = useToast()
  const {
    preferences,
    loading,
    error: preferencesError,
    updateProfile,
    updateLanguage,
    updateCurrency,
  } = usePreferences()
  const [nameOverride, setNameOverride] = useState(null)
  const [currencySearch, setCurrencySearch] = useState('')
  const [currencyMenuOpen, setCurrencyMenuOpen] = useState(false)
  const [passwordMessage, setPasswordMessage] = useState('')
  const [passwordError, setPasswordError] = useState('')
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState('')
  const [activeSection, setActiveSection] = useState('profile')

  const fullName = nameOverride ?? preferences.full_name ?? user?.user_metadata?.full_name ?? ''
  const migrationRequired = preferencesError === PROFILE_PREFERENCES_MIGRATION_REQUIRED

  const matchingCurrencies = useMemo(() => {
    const query = currencySearch.trim().toLowerCase()
    if (!query) return CURRENCIES
    return CURRENCIES.filter(({ code, name, symbol }) =>
      `${code} ${name} ${symbol}`.toLowerCase().includes(query),
    )
  }, [currencySearch])

  async function saveProfile(event) {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    setNotice('')
    setNoticeError('')
    try {
      await updateProfile(fullName)
      setNameOverride(fullName.trim())
      setNotice(t('common.saved'))
      notify('success', t('toast.profileSaved'))
    } catch (saveError) {
      setNoticeError(saveError.message || t('settings.profileDescription'))
      notify('error', saveError.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function savePreference(save, value) {
    if (saving) return
    setSaving(true)
    setNotice('')
    setNoticeError('')
    try {
      await save(value)
      setNotice(t('common.saved'))
      notify('success', t('toast.preferencesSaved'))
    } catch (saveError) {
      setNoticeError(saveError.message || t('common.noData'))
      notify('error', saveError.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function savePassword(event) {
    event.preventDefault()
    if (saving) return
    const formElement = event.currentTarget
    setPasswordMessage('')
    setPasswordError('')
    const form = new FormData(formElement)
    const password = String(form.get('newPassword') || '')
    const confirmation = String(form.get('confirmNewPassword') || '')
    if (password.length < 8) {
      setPasswordError(t('settings.passwordMin'))
      return
    }
    if (password !== confirmation) {
      setPasswordError(t('settings.passwordMismatch'))
      return
    }
    setSaving(true)
    try {
      await updatePassword(password)
      formElement.reset()
      setPasswordMessage(t('auth.passwordUpdated'))
      notify('success', t('toast.passwordUpdated'))
    } catch (saveError) {
      setPasswordError(saveError.message || t('common.noData'))
      notify('error', saveError.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="settings-page" aria-labelledby="settings-title">
      <div className="settings-intro">
        <p className="eyebrow"><span className="eyebrow-line" /> MYFINANCE</p>
        <h1 id="settings-title">{t('settings.title')}</h1>
        <p>{t('settings.profileDescription')}</p>
      </div>

      {preferencesError && (
        <p className="form-message form-error" role="alert">
          {migrationRequired ? t('settings.migrationRequired') : preferencesError}
        </p>
      )}
      {notice && <p className="form-message form-success" role="status">{notice}</p>}
      {noticeError && <p className="form-message form-error" role="alert">{noticeError}</p>}

      <div className="settings-layout">
        <nav className="settings-subnav surface-card" aria-label={t('settings.submenu')}>
          {[
            ['profile', 'settings.menuProfile'],
            ['currency', 'settings.menuCurrency'],
            ['language', 'settings.menuLanguage'],
            ['password', 'settings.menuPassword'],
            ['account', 'settings.menuAccount'],
          ].map(([section, label]) => (
            <button
              aria-current={activeSection === section ? 'page' : undefined}
              className={activeSection === section ? 'active' : ''}
              key={section}
              onClick={() => setActiveSection(section)}
              type="button"
            >
              {t(label)}
            </button>
          ))}
        </nav>
        <div className="settings-section-content">
        {activeSection === 'profile' && <section className="surface-card settings-card">
          <div className="settings-card-heading">
            <div><h2>{t('settings.profile')}</h2><p>{t('settings.personalInformation')}</p></div>
          </div>
          <form className="settings-form" onSubmit={saveProfile}>
            <label>{t('common.fullName')}
              <input
                autoComplete="name"
                maxLength="120"
                onChange={(event) => setNameOverride(event.target.value)}
                required
                value={fullName}
              />
            </label>
            <label>{t('common.email')}
              <input autoComplete="email" readOnly value={user?.email || ''} />
              <small>{t('settings.emailReadOnly')}</small>
            </label>
            <button className="primary-button" type="submit" disabled={saving || loading}>
              {saving && <span className="inline-spinner" aria-hidden="true" />}
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </form>
        </section>}

        {activeSection === 'language' && <section className="surface-card settings-card">
          <div className="settings-card-heading">
            <div><h2>{t('settings.language')}</h2><p>{t('settings.languageDescription')}</p></div>
            <span className="settings-active-badge">{preferences.language.toUpperCase()}</span>
          </div>
          <label className="settings-field">{t('settings.languageLabel')}
            <select
              disabled={saving || loading || Boolean(preferencesError)}
              onChange={(event) => savePreference(updateLanguage, event.target.value)}
              value={preferences.language}
            >
              {LANGUAGES.map((language) => (
                <option key={language.code} value={language.code}>
                  {language.name} ({language.code.toUpperCase()})
                </option>
              ))}
            </select>
          </label>
          <p className="settings-current">{t('settings.activeLanguage')}: <strong>{LANGUAGES.find(({ code }) => code === preferences.language)?.name}</strong></p>
        </section>}

        {activeSection === 'currency' && <section className="surface-card settings-card">
          <div className="settings-card-heading">
            <div><h2>{t('settings.currency')}</h2><p>{t('settings.currencyDescription')}</p></div>
            <span className="settings-active-badge">{preferences.currency}</span>
          </div>
          <div className="currency-picker">
            <label className="settings-field" htmlFor="currency-search">{t('settings.currencyLabel')}
              <input
                autoComplete="off"
                disabled={saving || loading || Boolean(preferencesError)}
                id="currency-search"
                onFocus={() => {
                  setCurrencySearch('')
                  setCurrencyMenuOpen(true)
                }}
                onChange={(event) => {
                  setCurrencySearch(event.target.value)
                  setCurrencyMenuOpen(true)
                }}
                placeholder={t('settings.searchCurrency')}
                role="combobox"
                aria-expanded={currencyMenuOpen}
                aria-controls="currency-options"
                value={currencyMenuOpen ? currencySearch : currencyLabel(preferences.currency)}
              />
            </label>
            {currencyMenuOpen && (
              <div className="currency-options" id="currency-options" role="listbox">
                {matchingCurrencies.length ? matchingCurrencies.map((currency) => (
                  <button
                    aria-selected={preferences.currency === currency.code}
                    className={preferences.currency === currency.code ? 'selected' : ''}
                    key={currency.code}
                    onClick={() => {
                      setCurrencyMenuOpen(false)
                      setCurrencySearch('')
                      savePreference(updateCurrency, currency.code)
                    }}
                    role="option"
                    type="button"
                  >
                    <strong>{currency.code}</strong>
                    <span>{currency.name}</span>
                    <small>{currency.symbol}</small>
                  </button>
                )) : <p>{t('settings.noCurrency')}</p>}
              </div>
            )}
          </div>
          <p className="settings-current">{t('settings.activeCurrency')}: <strong>{currencyLabel(preferences.currency)}</strong></p>
          <p className="settings-warning">{t('settings.currencyWarning')}</p>
        </section>}

        {activeSection === 'password' && <section className="surface-card settings-card">
          <div className="settings-card-heading">
            <div><h2>{t('settings.password')}</h2><p>{t('settings.passwordDescription')}</p></div>
          </div>
          <form className="settings-form" onSubmit={savePassword}>
            <label>{t('settings.newPassword')}
              <input autoComplete="new-password" minLength="8" name="newPassword" type="password" required />
            </label>
            <label>{t('settings.confirmNewPassword')}
              <input autoComplete="new-password" minLength="8" name="confirmNewPassword" type="password" required />
            </label>
            {passwordError && <p className="form-message form-error" role="alert">{passwordError}</p>}
            {passwordMessage && <p className="form-message form-success" role="status">{passwordMessage}</p>}
            <button className="primary-button" type="submit" disabled={saving || loading}>
              {saving && <span className="inline-spinner" aria-hidden="true" />}
              {saving ? t('common.saving') : t('settings.updatePassword')}
            </button>
          </form>
        </section>}

        {activeSection === 'account' && <section className="surface-card settings-card account-settings-card">
          <div className="settings-card-heading">
            <div><h2>{t('settings.account')}</h2><p>{t('settings.accountDescription', { email: user?.email || '' })}</p></div>
          </div>
          <button className="secondary-button" type="button" onClick={onSignOut}>
            {t('settings.signOut')}
          </button>
        </section>}
        </div>
      </div>
    </section>
  )
}

export default ProfileSettings
