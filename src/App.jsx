import { useEffect, useMemo, useRef, useState } from 'react'
import { useAuth } from './context/AuthContext.js'
import { useTheme } from './context/ThemeContext.js'
import { usePreferences } from './context/PreferencesContext.js'
import { useI18n } from './context/I18nContext.js'
import { financeService } from './services/financeService.js'
import { CURRENCIES, formatCurrency as formatMoney } from './lib/preferences.js'
import ProfileSettings from './components/ProfileSettings.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import DashboardSkeleton from './components/DashboardSkeleton.jsx'
import LoadingScreen from './components/LoadingScreen.jsx'
import { useToast } from './context/useToast.js'
import './App.css'

const navigation = [
  { label: 'Overview', key: 'overview', icon: 'grid' },
  { label: 'Transactions', key: 'transactions', icon: 'swap' },
  { label: 'Accounts', key: 'accounts', icon: 'wallet' },
  { label: 'Budgets', key: 'budgets', icon: 'chart' },
  { label: 'Goals', key: 'goals', icon: 'target' },
]
const EMPTY_LIST = Object.freeze([])
const PAGE_IDS = Object.freeze({
  overview: 'Overview',
  transactions: 'Transactions',
  accounts: 'Accounts',
  budgets: 'Budgets',
  goals: 'Goals',
  settings: 'Settings',
  about: 'About',
})

function pageFromLocation() {
  return PAGE_IDS[window.location.hash.slice(1).toLowerCase()] || 'Overview'
}

function Icon({ name, size = 20, strokeWidth = 1.8 }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round',
    strokeLinejoin: 'round',
    'aria-hidden': true,
  }

  const paths = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" /></>,
    swap: <><path d="M16 3l4 4-4 4" /><path d="M4 7h16M8 21l-4-4 4-4" /><path d="M20 17H4" /></>,
    wallet: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 15h.01" /><path d="M6 5V4a2 2 0 0 1 2-2h10" /></>,
    chart: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /><path d="M17 7h2v2" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="m19.4 15 .1.1 1.4 1.1-1.4 2.4-1.7-.7a8 8 0 0 1-1.5.9l-.3 1.8h-2.8l-.3-1.8a8 8 0 0 1-1.5-.9l-1.7.7-1.4-2.4 1.4-1.1a7 7 0 0 1 0-1.8l-1.4-1.1 1.4-2.4 1.7.7a8 8 0 0 1 1.5-.9l.3-1.8h2.8l.3 1.8a8 8 0 0 1 1.5.9l1.7-.7 1.4 2.4-1.4 1.1a7 7 0 0 1 0 1.8Z" transform="translate(-1 -1)" /></>,
    bell: <><path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
    chevron: <path d="m7 10 5 5 5-5" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
    moon: <path d="M20.8 13A8.7 8.7 0 0 1 11 3.2 8.9 8.9 0 1 0 20.8 13Z" />,
    monitor: <><rect x="3" y="4" width="18" height="13" rx="2" /><path d="M8 21h8m-4-4v4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrowUp: <><path d="M12 19V5m-6 6 6-6 6 6" /></>,
    arrowDown: <><path d="M12 5v14m6-6-6 6-6-6" /></>,
    arrowRight: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    basket: <><path d="m3 9 2 11h14l2-11H3Z" /><path d="m8 9 4-6 4 6M8 13v3m4-3v3m4-3v3" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18m-11 0v2h4v-2" /></>,
    coffee: <><path d="M4 9h14v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V9Zm14 2h2a2 2 0 1 1 0 4h-2M8 3v3m4-3v3m4-3v3" /></>,
    car: <><path d="m5 11 1.5-5h11L19 11l2 2v5h-2m-14 0H3v-5l2-2Z" /><path d="M5 11h14M7 18v2m10-2v2M7 15h.01M17 15h.01" /></>,
    play: <><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m10 9 5 3-5 3V9Z" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
    logout: <><path d="M10 17l5-5-5-5m5 5H3" /><path d="M12 3h6a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-6" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>,
  }

  return <svg {...common}>{paths[name] || paths.grid}</svg>
}

function Brand({ compact = false }) {
  return (
    <div className={`brand${compact ? ' brand-compact' : ''}`}>
      <span className="brand-mark"><span /><span /><span /><span /></span>
      {!compact && <span className="brand-name">myfinance<span>.</span></span>}
    </div>
  )
}

function ThemeSwitcher() {
  const { theme, setTheme } = useTheme()
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  const options = [
    { id: 'light', label: t('theme.light'), icon: 'sun' },
    { id: 'dark', label: t('theme.dark'), icon: 'moon' },
    { id: 'system', label: t('theme.system'), icon: 'monitor' },
  ]
  const selected = options.find((option) => option.id === theme)

  return (
    <div className="popover-wrap">
      <button
        className="icon-button theme-trigger"
        type="button"
        aria-label={t('theme.label', { theme: selected.label })}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <Icon name={selected.icon} size={18} />
      </button>
      {open && (
        <div className="popover theme-menu" role="menu" aria-label={t('theme.appearance')}>
          <p className="popover-heading">{t('theme.appearance')}</p>
          {options.map((option) => (
            <button
              className={`theme-option${theme === option.id ? ' selected' : ''}`}
              key={option.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === option.id}
              onClick={() => {
                setTheme(option.id)
                setOpen(false)
              }}
            >
              <Icon name={option.icon} size={17} />
              <span>{option.label}</span>
              {theme === option.id && <span className="theme-check">✓</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function formatCurrency(value, currency = 'IDR') {
  const language = document.documentElement.lang || 'id'
  return formatMoney(value, currency, language)
}

function formatTransactionDate(value) {
  return new Intl.DateTimeFormat(document.documentElement.lang || 'id', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value))
}

function toLocalDateTime(value) {
  const date = value ? new Date(value) : new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function toDateInput(date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function CashFlowChart({ data, t }) {
  const maxValue = Math.max(1, ...data.flatMap((month) => [Number(month.income), Number(month.expenses)]))
  const hasData = data.some((month) => Number(month.income) > 0 || Number(month.expenses) > 0)

  return (
    <div className="cash-chart" aria-label={t('dashboard.cashFlowSubtitle')}>
      <div className="chart-grid">
        {[0, 1, 2, 3].map((line) => <span key={line} />)}
      </div>
      {data.length && hasData ? <div className="chart-bars">
        {data.map((bar) => (
          <div className="chart-column" key={bar.month}>
            <div className="bar-pair">
              <span className="bar income-bar" style={{ height: `${Number(bar.income) / maxValue * 94}%` }} />
              <span className="bar expense-bar" style={{ height: `${Number(bar.expenses) / maxValue * 94}%` }} />
            </div>
            <span className={`chart-month${bar === data[data.length - 1] ? ' current-month' : ''}`}>
            {new Intl.DateTimeFormat(document.documentElement.lang || 'id', { month: 'short', timeZone: 'UTC' }).format(new Date(`${bar.month}-01T00:00:00Z`))}
            </span>
          </div>
        ))}
      </div> : <div className="chart-empty">{t('dashboard.noCashflow')}</div>}
    </div>
  )
}

function DonutChart({ categories, total, currency, t }) {
  const circumference = 2 * Math.PI * 62
  let offset = 0

  return (
    <div className="donut-wrap" aria-label="Spending by category">
      <svg className="donut-chart" viewBox="0 0 160 160" role="img" aria-label={t('dashboard.spending')}>
        <circle className="donut-track" cx="80" cy="80" r="62" />
        {total > 0 && categories.map((category, index) => {
          const segmentLength = Number(category.amount) / total * circumference
          const segmentOffset = offset
          offset += segmentLength
          return (
            <circle
              className={`donut-segment segment-${index % 4}`}
              cx="80"
              cy="80"
              key={category.category_id || category.name}
              r="62"
              style={{
                strokeDasharray: `${Math.max(segmentLength - 3, 0)} ${circumference}`,
                strokeDashoffset: -segmentOffset,
              }}
            />
          )
        })}
      </svg>
      <div className="donut-center"><strong>{formatCurrency(total, currency)}</strong><span>{t('dashboard.thisMonth')}</span></div>
    </div>
  )
}

function AuthScreen() {
  const { t } = useI18n()
  const { notify } = useToast()
  const {
    signIn,
    signUp,
    resetPassword,
    updatePassword,
    authError,
    clearAuthError,
  } = useAuth()
  const params = new URLSearchParams(window.location.search)
  const initialMode = params.get('reset-password') === '1' ? 'reset' : 'login'
  const [mode, setMode] = useState(initialMode)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [formError, setFormError] = useState('')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setFormError('')
    setMessage('')
    clearAuthError()
    const form = new FormData(event.currentTarget)
    const email = String(form.get('email') || '').trim()
    const password = String(form.get('password') || '')
    const fullName = String(form.get('fullName') || '').trim()
    const confirmation = String(form.get('confirmPassword') || '')

    if (mode !== 'reset' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setFormError(t('auth.validEmail'))
      return
    }
    if (mode === 'register' && !fullName) {
      setFormError(t('auth.enterName'))
      return
    }
    if (mode === 'forgot') {
      setBusy(true)
      try {
        await resetPassword(email)
        setMessage(t('auth.resetSent'))
        notify('success', t('auth.resetSent'))
      } catch (error) {
        setFormError(error.message)
        notify('error', error.message || t('auth.authFailed'))
      } finally {
        setBusy(false)
      }
      return
    }
    if (mode === 'reset') {
      if (password.length < 8) {
        setFormError(t('auth.passwordMin'))
        return
      }
      if (password !== confirmation) {
        setFormError(t('auth.passwordMismatch'))
        return
      }
      setBusy(true)
      try {
        await updatePassword(password)
        window.history.replaceState({}, '', window.location.pathname)
        setMessage(t('auth.passwordUpdated'))
        notify('success', t('auth.passwordUpdated'))
        setMode('login')
      } catch (error) {
        setFormError(error.message)
        notify('error', error.message || t('auth.authFailed'))
      } finally {
        setBusy(false)
      }
      return
    }
    if (mode === 'register' && password.length < 8) {
      setFormError(t('auth.passwordMin'))
      return
    }
    if (mode === 'login' && !password) {
      setFormError(t('auth.enterPassword'))
      return
    }
    if (mode === 'register' && password !== confirmation) {
      setFormError(t('auth.passwordMismatch'))
      return
    }

    setBusy(true)
    try {
      if (mode === 'register') {
        const result = await signUp(fullName, email, password)
        if (!result.session) {
          setMessage(t('auth.verifyEmail'))
          notify('success', t('toast.accountCreated'))
        }
      } else {
        await signIn(email, password)
        notify('success', t('toast.signedIn'))
      }
    } catch (error) {
      setFormError(error.message)
      notify('error', error.message || t('auth.authFailed'))
    } finally {
      setBusy(false)
    }
  }

  const title = {
    login: t('auth.welcome'),
    register: t('auth.createAccount'),
    forgot: t('auth.forgotPassword'),
    reset: t('auth.newPassword'),
  }[mode]

  return (
    <main className="auth-shell">
      <section className="auth-card glass-panel">
        <div className="auth-brand"><Brand /><ThemeSwitcher /></div>
        <p className="eyebrow"><span className="eyebrow-line" /> {t('auth.financialSpace')}</p>
        <h1>{title}</h1>
        <p className="auth-intro">
          {mode === 'register' ? t('auth.registerIntro') :
            mode === 'forgot' ? t('auth.forgotIntro') :
              mode === 'reset' ? t('auth.resetIntro') :
                t('auth.loginIntro')}
        </p>
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && <label>{t('common.fullName')}<input name="fullName" autoComplete="name" maxLength="120" required /></label>}
          {mode !== 'reset' && <label>{t('common.email')}<input name="email" type="email" autoComplete="email" required /></label>}
          {mode !== 'forgot' && <label>{mode === 'reset' ? t('auth.newPassword') : t('common.password')}<input name="password" type="password" minLength="8" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required /></label>}
          {(mode === 'register' || mode === 'reset') && <label>{t('common.confirmPassword')}<input name="confirmPassword" type="password" minLength="8" autoComplete="new-password" required /></label>}
          {mode === 'login' && <button className="auth-inline-link" type="button" onClick={() => { setMode('forgot'); setMessage(''); setFormError('') }}>{t('auth.forgotLink')}</button>}
          {(formError || authError) && <p className="form-message form-error" role="alert">{formError || authError}</p>}
          {message && <p className="form-message form-success" role="status">{message}</p>}
          <button className="primary-button auth-submit" type="submit" disabled={busy}>
            {busy && <span className="inline-spinner" aria-hidden="true" />}
            {busy ? t('auth.pleaseWait') : mode === 'register' ? t('auth.create') : mode === 'forgot' ? t('auth.sendReset') : mode === 'reset' ? t('common.updatePassword') : t('auth.signIn')}
          </button>
        </form>
        {mode !== 'forgot' && mode !== 'reset' && (
          <p className="auth-switch">
            {mode === 'login' ? t('auth.newTo') : t('auth.alreadyHave')}{' '}
            <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setMessage(''); setFormError('') }}>
              {mode === 'login' ? t('auth.createAccount') : t('auth.signIn')}
            </button>
          </p>
        )}
        {(mode === 'forgot' || mode === 'reset') && <p className="auth-switch"><button type="button" onClick={() => { setMode('login'); setMessage(''); setFormError('') }}>{t('auth.backToSignIn')}</button></p>}
      </section>
    </main>
  )
}

function App() {
  const { user, loading: authLoading, signOut } = useAuth()
  const { preferences, loading: preferencesLoading, error: preferencesError } = usePreferences()
  const { t } = useI18n()
  const { notify } = useToast()
  const [activePage, setActivePage] = useState(pageFromLocation)
  const skipHistoryPush = useRef(false)
  const [search, setSearch] = useState('')
  const searchInputRef = useRef(null)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [topProfileOpen, setTopProfileOpen] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [dashboardState, setDashboardState] = useState(null)
  const [dashboardLoadingUserId, setDashboardLoadingUserId] = useState(null)
  const [dashboardErrorState, setDashboardErrorState] = useState(null)
  const [modalType, setModalType] = useState('')
  const [modalOwnerId, setModalOwnerId] = useState(null)
  const [editingTransaction, setEditingTransaction] = useState(null)
  const [editingAccount, setEditingAccount] = useState(null)
  const [editingBudget, setEditingBudget] = useState(null)
  const [editingGoal, setEditingGoal] = useState(null)
  const [transactionKind, setTransactionKind] = useState('expense')
  const [sourceAccountId, setSourceAccountId] = useState('')
  const [requestId, setRequestId] = useState('')
  const [transactionDateValue, setTransactionDateValue] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmation, setConfirmation] = useState(null)
  const [showStartupScreen, setShowStartupScreen] = useState(true)
  const [budgetPeriod] = useState(() => {
    const today = new Date()
    return {
      start: toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)),
      end: toDateInput(new Date(today.getFullYear(), today.getMonth() + 1, 0)),
    }
  })
  const initializing = authLoading || Boolean(user && preferencesLoading)

  useEffect(() => {
    if (skipHistoryPush.current) {
      skipHistoryPush.current = false
      return
    }
    const pageId = Object.keys(PAGE_IDS).find((key) => PAGE_IDS[key] === activePage)
    if (pageId && window.location.hash !== `#${pageId}`) {
      window.history.pushState({ page: activePage }, '', `${window.location.pathname}${window.location.search}#${pageId}`)
    }
  }, [activePage])

  useEffect(() => {
    function restorePageFromHistory() {
      const page = pageFromLocation()
      if (page === activePage) return
      skipHistoryPush.current = true
      setActivePage(page)
    }
    window.addEventListener('popstate', restorePageFromHistory)
    window.addEventListener('hashchange', restorePageFromHistory)
    return () => {
      window.removeEventListener('popstate', restorePageFromHistory)
      window.removeEventListener('hashchange', restorePageFromHistory)
    }
  }, [activePage])

  useEffect(() => {
    if (!user) return undefined
    let active = true
    Promise.resolve()
      .then(() => {
        if (!active) return null
        setDashboardLoadingUserId(user.id)
        setDashboardErrorState(null)
        return financeService.getDashboard()
      })
      .then((result) => {
        if (active && result) setDashboardState({ ...result, ownerId: user.id })
      })
      .catch((error) => {
        if (active) setDashboardErrorState({ ownerId: user.id, message: error.message || 'Your financial data could not be loaded.' })
      })
      .finally(() => {
        if (active) setDashboardLoadingUserId(null)
      })
    return () => { active = false }
  }, [user, preferences.currency])

  const loadedDashboard = dashboardState?.ownerId === user?.id ? dashboardState : null
  const currency = preferencesError
    ? loadedDashboard?.currency || 'IDR'
    : preferences.currency || loadedDashboard?.currency || 'IDR'
  const dashboard = loadedDashboard?.currency === currency ? loadedDashboard : null
  const dashboardLoading = dashboardLoadingUserId === user?.id && !dashboard
  const dashboardError = dashboardErrorState && dashboardErrorState.ownerId === user?.id
    ? dashboardErrorState.message
    : ''
  const accounts = dashboard?.accounts ?? EMPTY_LIST
  const categories = dashboard?.categories ?? EMPTY_LIST
  const transactions = dashboard?.transactions ?? EMPTY_LIST
  const budgets = dashboard?.budgets ?? EMPTY_LIST
  const goals = dashboard?.goals ?? EMPTY_LIST
  const notifications = dashboard?.notifications ?? EMPTY_LIST
  const filteredTransactions = useMemo(() => {
    const normalize = (value) => String(value ?? '')
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .toLocaleLowerCase()
    const query = normalize(search.trim())
    if (!query) return transactions
    return transactions.filter((transaction) => normalize([
      transaction.description,
      transaction.merchant,
      transaction.category_name,
      transaction.account_name,
      transaction.to_account_name,
      transaction.transaction_type,
      transaction.amount,
      transaction.occurred_at,
    ].join(' ')).includes(query))
  }, [transactions, search])

  function submitSearch(event) {
    event.preventDefault()
    setActivePage('Transactions')
    searchInputRef.current?.focus()
  }

  async function refreshDashboard() {
    setDashboardErrorState(null)
    setDashboardLoadingUserId(user.id)
    try {
      setDashboardState({ ...(await financeService.getDashboard()), ownerId: user.id })
    } catch (error) {
      setDashboardErrorState({ ownerId: user.id, message: error.message || 'Your financial data could not be refreshed.' })
    } finally {
      setDashboardLoadingUserId(null)
    }
  }

  function openModal(type, transaction = null) {
    setFormError('')
    setModalOwnerId(user.id)
    setEditingTransaction(transaction)
    setEditingAccount(type === 'account' ? transaction : null)
    setEditingBudget(type === 'budget' ? transaction : null)
    setEditingGoal(type === 'goal' ? transaction : null)
    if (type === 'transaction') {
      setTransactionKind(transaction?.transaction_type || 'expense')
      setRequestId(transaction ? '' : window.crypto.randomUUID())
      setTransactionDateValue(toLocalDateTime(transaction?.occurred_at))
      setSourceAccountId(transaction?.account_id || accounts.find((account) => !account.is_archived)?.id || '')
    }
    setModalType(type)
  }

  function closeModal() {
    setModalType('')
    setModalOwnerId(null)
    setEditingTransaction(null)
    setEditingAccount(null)
    setEditingBudget(null)
    setEditingGoal(null)
    setRequestId('')
    setTransactionDateValue('')
    setFormError('')
  }

  async function submitModal(event) {
    event.preventDefault()
    if (saving) return
    setFormError('')
    setSaving(true)
    const values = Object.fromEntries(new FormData(event.currentTarget).entries())
    try {
      if (modalType === 'account') {
        const accountInput = {
          name: values.name,
          accountType: values.accountType,
          currency: values.currency,
          openingBalance: values.openingBalance,
          isArchived: editingAccount?.is_archived,
        }
        if (editingAccount) {
          await financeService.updateAccount(user.id, editingAccount.id, accountInput)
        } else {
          await financeService.createAccount(user.id, accountInput)
        }
      } else if (modalType === 'transaction') {
        const input = {
          description: values.description,
          amount: values.amount,
          occurredAt: values.occurredAt ? new Date(values.occurredAt).toISOString() : new Date().toISOString(),
          accountId: values.accountId,
          categoryId: values.categoryId || null,
          transactionType: values.transactionType,
          merchant: values.merchant,
          notes: values.notes,
          requestId: values.requestId,
        }
        if (values.transactionType === 'transfer') {
          if (values.accountId === values.toAccountId) throw new Error(t('form.sameTransferAccount'))
          await financeService.createTransfer(user.id, {
            fromAccountId: values.accountId,
            toAccountId: values.toAccountId,
            amount: values.amount,
            description: values.description,
            occurredAt: input.occurredAt,
            requestId: values.requestId,
          })
        } else if (editingTransaction) {
          await financeService.updateTransaction(user.id, editingTransaction.id, input)
        } else {
          await financeService.createTransaction(user.id, input)
        }
      } else if (modalType === 'goal') {
        const goalInput = {
          name: values.name,
          currency: editingGoal?.currency || currency,
          targetAmount: values.targetAmount,
          savedAmount: values.savedAmount,
          targetDate: values.targetDate,
        }
        if (editingGoal) {
          await financeService.updateGoal(user.id, editingGoal.id, goalInput)
        } else {
          await financeService.createGoal(user.id, goalInput)
        }
      } else if (modalType === 'budget') {
        const budgetInput = {
          categoryId: values.categoryId,
          currency: editingBudget?.currency || currency,
          amount: values.amount,
          periodStart: values.periodStart,
          periodEnd: values.periodEnd,
        }
        if (editingBudget) {
          await financeService.updateBudget(user.id, editingBudget.id, budgetInput)
        } else {
          await financeService.createBudget(user.id, budgetInput)
        }
      } else if (modalType === 'category') {
        await financeService.createCategory(user.id, {
          name: values.name,
          categoryType: values.categoryType,
        })
      }
      const nextModal = modalType === 'category' ? 'transaction' : ''
      setModalType(nextModal)
      setEditingTransaction(null)
      setEditingAccount(null)
      setEditingBudget(null)
      setEditingGoal(null)
      await refreshDashboard()
      notify('success', t('toast.saved'))
    } catch (error) {
      setFormError(error.message || t('common.saveFailed'))
      notify('error', error.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function deleteTransaction(transaction) {
    const isTransfer = transaction.transaction_type === 'transfer'
    setConfirmation({
      ownerId: user.id,
      description: isTransfer
        ? t('confirm.deleteTransfer', { from: transaction.account_name, to: transaction.to_account_name })
        : t('confirm.deleteTransaction', { description: transaction.description }),
      onConfirm: async () => {
        if (isTransfer) await financeService.deleteTransfer(user.id, transaction.id)
        else await financeService.deleteTransaction(user.id, transaction.id)
        setConfirmation(null)
        notify('success', t('toast.deleted'))
        await refreshDashboard()
      },
    })
  }

  async function deleteRecord(type, record) {
    setConfirmation({
      ownerId: user.id,
      description: t('confirm.deleteRecord', { name: record.name || record.category_name }),
      onConfirm: async () => {
        if (type === 'account') await financeService.deleteAccount(user.id, record.id)
        if (type === 'budget') await financeService.deleteBudget(user.id, record.id)
        if (type === 'goal') await financeService.deleteGoal(user.id, record.id)
        if (type === 'category') await financeService.deleteCategory(user.id, record.id)
        setConfirmation(null)
        notify('success', t('toast.deleted'))
        await refreshDashboard()
      },
    })
  }

  async function toggleAccountArchive(account) {
    if (saving) return
    setSaving(true)
    try {
      await financeService.updateAccount(user.id, account.id, {
        name: account.name,
        accountType: account.account_type,
        isArchived: !account.is_archived,
      })
      await refreshDashboard()
      notify('success', account.is_archived ? t('toast.accountRestored') : t('toast.accountArchived'))
    } catch (error) {
      setDashboardErrorState({ ownerId: user.id, message: error.message || 'The account could not be updated.' })
      notify('error', error.message || t('common.saveFailed'))
    } finally {
      setSaving(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      setDashboardErrorState({ ownerId: user.id, message: error.message || 'Could not sign out.' })
      notify('error', error.message || t('auth.signOutFailed'))
    }
  }

  const isPasswordReset = new URLSearchParams(window.location.search).get('reset-password') === '1'
  if (!user || isPasswordReset) {
    return (
      <>
        <AuthScreen />
        {showStartupScreen && (
          <LoadingScreen
            exiting={!initializing}
            onAnimationEnd={(event) => {
              if (event.target === event.currentTarget && !initializing) setShowStartupScreen(false)
            }}
          />
        )}
      </>
    )
  }

  const fullName = preferences.full_name || user.user_metadata?.full_name || user.email
  const initials = String(fullName || 'MF').split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const pendingNotifications = notifications.filter((notification) => !notification.read_at)

  return (
    <div className="app-shell">
      <aside className={`sidebar glass-panel${mobileMenuOpen ? ' sidebar-open' : ''}`}>
        <div className="sidebar-top">
          <Brand />
          <button className="icon-button mobile-close" type="button" aria-label={t('dashboard.closeMenu')} onClick={() => setMobileMenuOpen(false)}>
            <Icon name="close" />
          </button>
        </div>

        <div className="workspace-switcher">
          <div className="workspace-avatar">{initials.slice(0, 1)}</div>
          <div className="workspace-copy"><strong>{fullName}</strong><span>{t('nav.workspace')}</span></div>
          <Icon name="chevron" size={16} />
        </div>

        <p className="nav-caption">{t('nav.menu')}</p>
        <nav className="primary-nav" aria-label={t('nav.menu')}>
          {navigation.map((item) => (
            <button
              className={`nav-item${activePage === item.label ? ' active' : ''}`}
              key={item.label}
              type="button"
              aria-current={activePage === item.label ? 'page' : undefined}
              onClick={() => {
                setActivePage(item.label)
                setMobileMenuOpen(false)
                setProfileOpen(false)
              }}
            >
              <Icon name={item.icon} size={19} />
              <span>{t(`nav.${item.key}`)}</span>
              {item.label === 'Transactions' && <span className="nav-count">{transactions.length}</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-spacer" />
        <div className="upgrade-card">
          <span className="upgrade-sparkle">✦</span>
          <strong>{t('dashboard.sidebarPromoTitle')}</strong>
          <p>{t('dashboard.sidebarPromoDescription')}</p>
          <button type="button" className="upgrade-link" onClick={() => setActivePage('Goals')}>{t('nav.goals')} <Icon name="arrowRight" size={15} /></button>
        </div>
        <button className={`nav-item settings-link${activePage === 'Settings' ? ' active' : ''}`} type="button" onClick={() => {
          setActivePage('Settings')
          setMobileMenuOpen(false)
          setProfileOpen(false)
        }}>
          <Icon name="settings" size={19} /><span>{t('nav.profileSettings')}</span>
        </button>
        <button className={`nav-item about-link${activePage === 'About' ? ' active' : ''}`} type="button" onClick={() => {
          setActivePage('About')
          setMobileMenuOpen(false)
          setProfileOpen(false)
        }}>
          <Icon name="info" size={19} /><span>{t('nav.about')}</span>
        </button>
        <div className="sidebar-footer">
          <div className="avatar">{initials}</div>
          <div className="profile-copy"><strong>{fullName}</strong><span>{user.email}</span></div>
          <button className="icon-button sidebar-more" type="button" aria-label={t('nav.profileOptions')} onClick={() => setProfileOpen(!profileOpen)}><Icon name="more" size={19} /></button>
          {profileOpen && (
            <div className="popover profile-menu">
              <p className="popover-heading">{t('nav.account')}</p>
              <button className="theme-option" type="button" onClick={() => { setActivePage('Settings'); setProfileOpen(false); setMobileMenuOpen(false) }}><Icon name="settings" size={17} /><span>{t('nav.profileSettings')}</span></button>
              <button className="theme-option" type="button" onClick={handleSignOut}><Icon name="logout" size={17} /><span>{t('nav.signOut')}</span></button>
            </div>
          )}
        </div>
      </aside>

      {mobileMenuOpen && <button className="mobile-backdrop" aria-label={t('nav.closeMenu')} type="button" onClick={() => setMobileMenuOpen(false)} />}

      <main className="main-content">
        <header className="topbar">
          <div className="mobile-brand"><button className="icon-button mobile-menu-button" type="button" aria-label={t('dashboard.openMenu')} onClick={() => setMobileMenuOpen(true)}><span className="menu-lines" /></button><Brand compact /></div>
          <div className="breadcrumb"><span>{t('nav.workspace')}</span><span className="breadcrumb-slash">/</span><strong>{activePage === 'Settings' ? t('nav.profileSettings') : t(`nav.${activePage.toLowerCase()}`)}</strong></div>
          <div className="topbar-actions">
            <form className="search-box" role="search" onSubmit={submitSearch}>
              <button className="search-submit" type="submit" aria-label={t('dashboard.submitSearch')}>
                <Icon name="search" size={17} />
              </button>
              <input
                ref={searchInputRef}
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setSearch('')
                }}
                placeholder={t('dashboard.search')}
                aria-label={t('nav.transactions')}
              />
              {search
                ? <button className="search-clear" type="button" aria-label={t('dashboard.clearSearch')} onClick={() => {
                  setSearch('')
                  searchInputRef.current?.focus()
                }}>×</button>
                : <kbd>⌘ K</kbd>}
            </form>
            <ThemeSwitcher />
            <div className="popover-wrap">
              <button className="icon-button notification-trigger" type="button" aria-label={t('dashboard.notifications')} aria-expanded={notificationOpen} onClick={() => setNotificationOpen(!notificationOpen)}>
                <Icon name="bell" size={18} />{pendingNotifications.length > 0 && <span className="notification-dot" />}
              </button>
              {notificationOpen && (
                <div className="popover notification-menu">
                  <div className="notification-heading"><strong>{t('notifications.title')}</strong><span>{t('notifications.unread', { count: pendingNotifications.length })}</span></div>
                  {notifications.length ? notifications.map((notification) => (
                    <button
                      className={`notification-item notification-action${notification.read_at ? ' is-read' : ''}`}
                      key={notification.id}
                      type="button"
                      onClick={async () => {
                        try {
                          await financeService.markNotificationRead(user.id, notification.id)
                          await refreshDashboard()
                        } catch (error) {
                          setDashboardErrorState({ ownerId: user.id, message: error.message })
                        }
                      }}
                    >
                      <span className="notice-icon"><Icon name="bell" size={17} /></span>
                      <span><strong>{notification.title}</strong><small>{notification.body}</small></span>
                    </button>
                  )) : <p className="notification-empty">{t('notifications.empty')}</p>}
                </div>
              )}
            </div>
            <div className="popover-wrap">
              <button className="top-avatar" type="button" aria-label={t('nav.profileSettings')} aria-expanded={topProfileOpen} onClick={() => setTopProfileOpen(!topProfileOpen)}>{initials}</button>
              {topProfileOpen && (
                <div className="popover top-profile-menu">
                  <p className="popover-heading">{user.email}</p>
                  <button className="theme-option" type="button" onClick={() => {
                    setActivePage('Settings')
                    setTopProfileOpen(false)
                  }}><Icon name="settings" size={17} /><span>{t('nav.profileSettings')}</span></button>
                  <button className="theme-option" type="button" onClick={handleSignOut}><Icon name="logout" size={17} /><span>{t('nav.signOut')}</span></button>
                </div>
              )}
            </div>
          </div>
        </header>

        <div className="page-content page-transition" key={activePage}>
          {activePage === 'Settings' ? <ProfileSettings onSignOut={handleSignOut} /> : activePage === 'About' ? (
            <section className="about-page surface-card" aria-labelledby="about-title">
              <p className="eyebrow"><span className="eyebrow-line" /> MYFINANCE</p>
              <h1 id="about-title">{t('about.title')}</h1>
              <span className="settings-active-badge">{t('about.version')}</span>
              <p>{t('about.description')}</p>
              <h2>{t('about.featuresTitle')}</h2>
              <ul>
                <li>{t('about.featureAccounts')}</li>
                <li>{t('about.featureTransactions')}</li>
                <li>{t('about.featureBudgetsGoals')}</li>
                <li>{t('about.featurePrivacy')}</li>
              </ul>
            </section>
          ) : <>
          <section className="welcome-row">
            <div>
              <p className="eyebrow"><span className="eyebrow-line" /> {t('dashboard.yourOverview')}</p>
              <h1>{t('dashboard.welcome', { name: String(fullName).split(' ')[0] })} <span className="wave">✳</span></h1>
              <p className="welcome-subtitle">{t('dashboard.subtitle')}</p>
            </div>
            <button className="primary-button" type="button" onClick={() => openModal('transaction')} disabled={dashboardLoading || accounts.filter((account) => !account.is_archived).length === 0}><Icon name="plus" size={18} /> {t('dashboard.addTransaction')}</button>
          </section>

          {dashboardError && <div className="dashboard-error" role="alert"><span>{dashboardError}</span><button type="button" onClick={refreshDashboard}>{t('common.retry')}</button></div>}
          {dashboardLoading && !dashboard && <DashboardSkeleton />}
          {!dashboardLoading && !dashboardError && dashboard && accounts.length === 0 && (
            <div className="first-account glass-panel">
              <span className="upgrade-sparkle">✦</span><div><strong>{t('dashboard.startAccountTitle')}</strong><p>{t('dashboard.startAccountDescription')}</p></div>
              <button className="primary-button" type="button" onClick={() => openModal('account')}><Icon name="plus" size={17} /> {t('form.addAccount')}</button>
            </div>
          )}

          {dashboard && <section className="summary-grid" aria-label={t('dashboard.yourOverview')}>
            <article className="summary-card balance-card">
              <div className="card-topline"><span className="summary-label">{t('dashboard.totalBalance')}</span><span className="mini-icon navy-icon"><Icon name="wallet" size={17} /></span></div>
              <div className="balance-value">{formatCurrency(dashboard.balance, currency)}</div>
              <div className="summary-bottom"><span>{t('dashboard.acrossAccounts')}</span><button type="button" className="summary-action" onClick={() => openModal('account')}>{t('dashboard.manageAccounts')}</button></div>
            </article>
            <article className="summary-card">
              <div className="card-topline"><span className="summary-label">{t('dashboard.income')}</span><span className="mini-icon income-icon"><Icon name="arrowDown" size={17} /></span></div>
              <div className="summary-value">{formatCurrency(dashboard.income, currency)}</div>
              <div className="summary-bottom"><span>{t('dashboard.thisMonth')}</span></div>
            </article>
            <article className="summary-card">
              <div className="card-topline"><span className="summary-label">{t('dashboard.expenses')}</span><span className="mini-icon expense-icon"><Icon name="arrowUp" size={17} /></span></div>
              <div className="summary-value">{formatCurrency(dashboard.expenses, currency)}</div>
              <div className="summary-bottom"><span>{t('dashboard.transfersExcluded')}</span></div>
            </article>
            <article className="summary-card">
              <div className="card-topline"><span className="summary-label">{t('dashboard.savings')}</span><span className="mini-icon savings-icon"><Icon name="target" size={17} /></span></div>
              <div className="summary-value">{formatCurrency(dashboard.savings, currency)}</div>
              <div className="summary-bottom"><span>{t('dashboard.activeSavings')}</span></div>
            </article>
          </section>}
          {dashboard && <p className="currency-scope-note">{t('dashboard.settingsCurrencyNote', { currency })}</p>}

          {dashboard && <section className="analytics-grid">
            <article className="surface-card cashflow-card">
              <div className="section-heading">
                <div><h2>{t('dashboard.cashFlow')}</h2><p>{t('dashboard.cashFlowSubtitle')}</p></div>
                <div className="chart-controls">
                  <div className="chart-legend"><span><i className="legend-income" /> {t('dashboard.income')}</span><span><i className="legend-expense" /> {t('dashboard.expenses')}</span></div>
                  <span className="chart-period-label">{t('dashboard.sixMonths')}</span>
                </div>
              </div>
              <CashFlowChart data={dashboard.cashflow ?? []} t={t} />
            </article>

            <article className="surface-card spending-card">
              <div className="section-heading"><div><h2>{t('dashboard.spending')}</h2><p>{t('dashboard.spendingSubtitle')}</p></div><button className="icon-button subtle-more" type="button" aria-label={t('dashboard.spending')}><Icon name="more" size={19} /></button></div>
              <div className="spending-content">
                <DonutChart categories={dashboard.category_spending ?? []} total={Number(dashboard.expenses)} currency={currency} t={t} />
                <div className="spending-legend">
                  {(dashboard.category_spending ?? []).length ? dashboard.category_spending.slice(0, 5).map((category, index) => (
                    <div key={category.category_id || category.name}><span className={`category-dot dot-${index % 4}`} /><span>{category.name || 'Uncategorized'}</span><strong>{Number(dashboard.expenses) > 0 ? `${Math.round(Number(category.amount) / Number(dashboard.expenses) * 100)}%` : '0%'}</strong></div>
                  )) : <p className="empty-inline">{t('dashboard.noExpenses')}</p>}
                </div>
              </div>
            </article>
          </section>}

          {dashboard && <section className="lower-grid">
            <article className="surface-card transactions-card">
              <div className="section-heading transactions-heading">
                <div><h2>{t('dashboard.recentActivity')}</h2><p>{t('dashboard.activitySubtitle')}</p></div>
                <button className="text-link" type="button" onClick={() => setActivePage('Transactions')}>{t('dashboard.viewAll')} <Icon name="arrowRight" size={15} /></button>
              </div>
              <div className="transaction-table">
                <div className="table-header"><span>{t('dashboard.name')}</span><span>{t('dashboard.category')}</span><span>{t('dashboard.date')}</span><span>{t('dashboard.amount')}</span><span /></div>
                {filteredTransactions.length ? filteredTransactions.slice(0, activePage === 'Transactions' ? 50 : 5).map((transaction) => {
                  const isIncome = transaction.transaction_type === 'income'
                  const isTransfer = transaction.transaction_type === 'transfer'
                  const icon = isTransfer ? 'swap' : isIncome ? 'briefcase' : 'basket'
                  const amountLabel = `${isIncome ? '+' : isTransfer ? '' : '−'}${formatCurrency(transaction.amount, transaction.account_currency || currency)}`
                  return (
                  <div className="transaction-row" key={`${transaction.transaction_type}-${transaction.id}`}>
                    <div className="transaction-name"><span className={`transaction-icon ${isIncome ? 'blue' : isTransfer ? 'lavender' : 'mint'}`}><Icon name={icon} size={17} /></span><strong title={transaction.description}>{transaction.description}</strong></div>
                    <span className="transaction-category">{isTransfer ? t('form.to', { name: transaction.to_account_name }) : transaction.category_name || t('form.uncategorized')}</span>
                    <span className="transaction-date">{formatTransactionDate(transaction.occurred_at)}</span>
                    <strong className={`transaction-amount${isIncome ? ' is-income' : ''}`}>{amountLabel}</strong>
                    <div className="row-actions">
                      {!isTransfer && <button className="icon-button row-more" type="button" aria-label={`Edit ${transaction.description}`} onClick={() => openModal('transaction', transaction)}><Icon name="edit" size={15} /></button>}
                      <button className="icon-button row-more" type="button" aria-label={`Delete ${transaction.description}`} onClick={() => deleteTransaction(transaction)}><Icon name="trash" size={15} /></button>
                    </div>
                  </div>
                )}) : <div className="empty-search">{search ? t('dashboard.noSearchResults', { query: search }) : t('dashboard.noTransactions')}</div>}
              </div>
              <button className="add-goal-button transaction-add" type="button" onClick={() => openModal('transaction')} disabled={accounts.length === 0}><Icon name="plus" size={16} /> {t('dashboard.addTransaction')} / {t('form.transfer')}</button>
            </article>

            <article className="surface-card goal-card">
              <div className="section-heading"><div><h2>{t('dashboard.goalsBudgets')}</h2><p>{t('dashboard.goalsSubtitle')}</p></div></div>
              <div className="goals-list">
                {goals.map((goal) => {
                  const progress = Math.min(100, Number(goal.saved_amount) / Number(goal.target_amount) * 100)
                  return <div className="goal-item" key={goal.id}>
                    <div className="goal-icon travel-goal"><Icon name="target" size={18} /></div>
                    <div className="goal-details"><div className="goal-title"><strong>{goal.name}</strong><span>{Math.round(progress)}%</span></div><div className="goal-track"><span className="travel-progress" style={{ width: `${progress}%` }} /></div><small>{formatCurrency(goal.saved_amount, goal.currency || currency)} <span> / {formatCurrency(goal.target_amount, goal.currency || currency)}</span></small></div>
                    <div className="item-actions"><button className="icon-button row-more" type="button" aria-label={`Edit goal ${goal.name}`} onClick={() => openModal('goal', goal)}><Icon name="edit" size={15} /></button><button className="icon-button row-more" type="button" aria-label={`Delete goal ${goal.name}`} onClick={() => deleteRecord('goal', goal)}><Icon name="trash" size={15} /></button></div>
                  </div>
                })}
                {budgets.map((budget) => {
                  const progress = Math.min(100, Number(budget.spent) / Number(budget.amount) * 100)
                  return <div className="goal-item" key={budget.id}>
                    <div className="goal-icon dining-goal"><Icon name="basket" size={18} /></div>
                    <div className="goal-details"><div className="goal-title"><strong>{budget.category_name} · {t('nav.budgets')}</strong><span>{Math.round(progress)}%</span></div><div className="goal-track"><span className="dining-progress" style={{ width: `${progress}%` }} /></div><small>{formatCurrency(budget.spent, budget.currency || currency)} <span> / {formatCurrency(budget.amount, budget.currency || currency)}</span></small></div>
                    <div className="item-actions"><button className="icon-button row-more" type="button" aria-label={`Edit ${budget.category_name} budget`} onClick={() => openModal('budget', budget)}><Icon name="edit" size={15} /></button><button className="icon-button row-more" type="button" aria-label={`Delete ${budget.category_name} budget`} onClick={() => deleteRecord('budget', budget)}><Icon name="trash" size={15} /></button></div>
                  </div>
                })}
                {!goals.length && !budgets.length && <p className="empty-inline">{t('dashboard.noGoals')}</p>}
              </div>
              <div className="goal-actions">
                <button className="add-goal-button" type="button" onClick={() => openModal('goal')}><Icon name="plus" size={16} /> {t('dashboard.createGoal')}</button>
                <button className="add-goal-button" type="button" onClick={() => openModal('budget')} disabled={!categories.some((category) => category.category_type === 'expense')}><Icon name="plus" size={16} /> {t('dashboard.addBudget')}</button>
              </div>
            </article>
          </section>}
          {dashboard && activePage === 'Accounts' && <section className="surface-card accounts-card">
            <div className="section-heading"><div><h2>{t('dashboard.yourAccounts')}</h2><p>{t('dashboard.accountBalances')}</p></div><button className="primary-button" type="button" onClick={() => openModal('account')}><Icon name="plus" size={16} /> {t('form.addAccount')}</button></div>
            {accounts.length ? <div className="accounts-list">{accounts.map((account) => <div className="account-row" key={account.id}>
              <span className="goal-icon travel-goal"><Icon name="wallet" size={18} /></span><span className="account-name"><strong>{account.name}</strong><small>{t(`form.${account.account_type}`)}{account.is_archived ? ` · ${t('dashboard.archived')}` : ''} · {account.currency}</small></span><strong>{formatCurrency(account.balance, account.currency)}</strong>
              <div className="item-actions"><button className="icon-button row-more" type="button" aria-label={t('form.editRecord', { name: account.name })} onClick={() => openModal('account', account)}><Icon name="edit" size={15} /></button><button className="icon-button row-more" type="button" disabled={saving} aria-label={t(account.is_archived ? 'form.unarchiveAccount' : 'form.archiveAccount', { name: account.name })} onClick={() => toggleAccountArchive(account)}><Icon name={account.is_archived ? 'wallet' : 'close'} size={15} /></button><button className="icon-button row-more" type="button" disabled={saving} aria-label={t('form.deleteRecord', { name: account.name })} onClick={() => deleteRecord('account', account)}><Icon name="trash" size={15} /></button></div>
            </div>)}</div> : <p className="empty-inline">{t('dashboard.accountEmpty')}</p>}
          </section>}
          {dashboard && activePage === 'Budgets' && <section className="surface-card accounts-card">
            <div className="section-heading"><div><h2>{t('nav.budgets')}</h2><p>{t('dashboard.budgetTitle')}</p></div><button className="primary-button" type="button" onClick={() => openModal('budget')}><Icon name="plus" size={16} /> {t('dashboard.addBudget')}</button></div>
            {budgets.length ? budgets.map((budget) => <div className="goal-item" key={budget.id}><div className="goal-icon dining-goal"><Icon name="basket" size={18} /></div><div className="goal-details"><div className="goal-title"><strong>{budget.category_name}</strong><span>{formatCurrency(budget.spent, budget.currency || currency)} / {formatCurrency(budget.amount, budget.currency || currency)}</span></div><div className="goal-track"><span className="dining-progress" style={{ width: `${Math.min(100, Number(budget.spent) / Number(budget.amount) * 100)}%` }} /></div></div><div className="item-actions"><button className="icon-button row-more" type="button" aria-label={t('form.editRecord', { name: budget.category_name })} onClick={() => openModal('budget', budget)}><Icon name="edit" size={15} /></button><button className="icon-button row-more" type="button" aria-label={t('form.deleteRecord', { name: budget.category_name })} onClick={() => deleteRecord('budget', budget)}><Icon name="trash" size={15} /></button></div></div>) : <p className="empty-inline">{t('dashboard.budgetEmpty')}</p>}
          </section>}
          {dashboard && activePage === 'Goals' && <section className="surface-card accounts-card">
            <div className="section-heading"><div><h2>{t('dashboard.financialGoals')}</h2><p>{t('dashboard.goalTitle')}</p></div><button className="primary-button" type="button" onClick={() => openModal('goal')}><Icon name="plus" size={16} /> {t('dashboard.createGoal')}</button></div>
            {goals.length ? goals.map((goal) => <div className="goal-item" key={goal.id}><div className="goal-icon travel-goal"><Icon name="target" size={18} /></div><div className="goal-details"><div className="goal-title"><strong>{goal.name}</strong><span>{Math.round(Number(goal.saved_amount) / Number(goal.target_amount) * 100)}%</span></div><div className="goal-track"><span className="travel-progress" style={{ width: `${Math.min(100, Number(goal.saved_amount) / Number(goal.target_amount) * 100)}%` }} /></div><small>{formatCurrency(goal.saved_amount, goal.currency || currency)} <span> / {formatCurrency(goal.target_amount, goal.currency || currency)}</span></small></div><div className="item-actions"><button className="icon-button row-more" type="button" aria-label={t('form.editRecord', { name: goal.name })} onClick={() => openModal('goal', goal)}><Icon name="edit" size={15} /></button><button className="icon-button row-more" type="button" aria-label={t('form.deleteRecord', { name: goal.name })} onClick={() => deleteRecord('goal', goal)}><Icon name="trash" size={15} /></button></div></div>) : <p className="empty-inline">{t('dashboard.goalEmpty')}</p>}
          </section>}
          <footer className="page-footer"><span>MyFinance</span></footer>
          </>}
        </div>
      </main>

      {confirmation?.ownerId === user.id && (
        <ConfirmDialog
          description={confirmation.description}
          onCancel={() => setConfirmation(null)}
          onConfirm={confirmation.onConfirm}
          title={t('confirm.deleteTitle')}
        />
      )}
      {showStartupScreen && (
        <LoadingScreen
          exiting={!initializing}
          onAnimationEnd={(event) => {
            if (event.target === event.currentTarget && !initializing) setShowStartupScreen(false)
          }}
        />
      )}
      {modalType && modalOwnerId === user.id && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) closeModal() }}>
        <section className="form-modal glass-panel" role="dialog" aria-modal="true" aria-labelledby="modal-title">
          <div className="modal-heading"><div><p className="eyebrow"><span className="eyebrow-line" /> MYFINANCE</p><h2 id="modal-title">{modalType === 'account' ? t(editingAccount ? 'form.editAccount' : 'form.addAccount') : modalType === 'transaction' ? t(editingTransaction ? 'form.editTransaction' : 'form.addTransaction') : modalType === 'goal' ? t(editingGoal ? 'form.editGoal' : 'form.createGoal') : modalType === 'budget' ? t(editingBudget ? 'form.editBudget' : 'form.createBudget') : t('form.addCategory')}</h2></div><button className="icon-button" type="button" aria-label={t('form.closeDialog')} onClick={closeModal} disabled={saving}><Icon name="close" size={19} /></button></div>
          <form className="data-form" onSubmit={submitModal}>
            {modalType === 'account' && <>
              <label>{t('form.accountName')}<input name="name" maxLength="80" defaultValue={editingAccount?.name || ''} required /></label>
              <label>{t('form.accountType')}<select name="accountType" defaultValue={editingAccount?.account_type || 'checking'}><option value="checking">{t('form.checking')}</option><option value="savings">{t('form.savings')}</option><option value="cash">{t('form.cash')}</option></select></label>
              {!editingAccount && <>
                <label>{t('form.currency')}<select name="currency" defaultValue={currency}>{CURRENCIES.map((item) => <option key={item.code} value={item.code}>{item.code} · {item.name} · {item.symbol}</option>)}</select></label>
                <label>{t('form.openingBalance')} ({currency})<input name="openingBalance" type="number" min="0" max="9999999999999.99" step="0.01" defaultValue="0" required /></label>
              </>}
              {editingAccount && <p className="settings-warning">{t('form.currencyImmutable', { currency: editingAccount.currency })}</p>}
            </>}
            {modalType === 'transaction' && <>
              <label>{t('form.type')}<select name="transactionType" value={transactionKind} disabled={editingTransaction?.transaction_type === 'transfer'} onChange={(event) => setTransactionKind(event.target.value)}><option value="expense">{t('form.expense')}</option><option value="income">{t('form.income')}</option>{!editingTransaction && <option value="transfer">{t('form.transfer')}</option>}</select></label>
              <label>{t('form.description')}<input name="description" maxLength="160" defaultValue={editingTransaction?.description || ''} required /></label>
              <label>{t('form.amount')} ({accounts.find((account) => account.id === sourceAccountId)?.currency || currency})<input name="amount" type="number" min="0.01" max="9999999999999.99" step="0.01" defaultValue={editingTransaction?.amount || ''} required /></label>
                {!editingTransaction && <input type="hidden" name="requestId" value={requestId} />}
              <label>{transactionKind === 'transfer' ? t('form.fromAccount') : t('form.account')}<select name="accountId" value={sourceAccountId} onChange={(event) => setSourceAccountId(event.target.value)} required>{accounts.filter((account) => !account.is_archived).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select></label>
              {transactionKind !== 'transfer' && <label>{t('form.category')}<select name="categoryId" defaultValue={editingTransaction?.category_id || ''}><option value="">{t('form.uncategorized')}</option>{categories.filter((category) => category.category_type === transactionKind).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>}
              {!editingTransaction && transactionKind === 'transfer' && <label>{t('form.toAccount')}<select name="toAccountId" defaultValue="" required><option value="" disabled>{t('form.selectDestination')}</option>{accounts.filter((account) => !account.is_archived && account.id !== sourceAccountId).map((account) => <option key={account.id} value={account.id}>{account.name} · {account.currency}</option>)}</select><small>{t('form.transferNotice')}</small></label>}
              <label>{t('form.merchant')}<input name="merchant" maxLength="120" defaultValue={editingTransaction?.merchant || ''} /></label>
              <label>{t('form.notes')}<textarea name="notes" maxLength="1000" defaultValue={editingTransaction?.notes || ''} rows="2" /></label>
              <label>{t('form.date')}<input name="occurredAt" type="datetime-local" value={transactionDateValue} onChange={(event) => setTransactionDateValue(event.target.value)} required /></label>
              {transactionKind !== 'transfer' && <button className="auth-inline-link category-create-link" type="button" onClick={() => setModalType('category')}>{t('form.createCategory')}</button>}
            </>}
            {modalType === 'goal' && <>
              <label>{t('form.goalName')}<input name="name" maxLength="100" defaultValue={editingGoal?.name || ''} required /></label>
              <label>{t('form.targetAmount')} ({editingGoal?.currency || currency})<input name="targetAmount" type="number" min="0.01" step="0.01" defaultValue={editingGoal?.target_amount || ''} required /></label>
              <label>{t('form.savedAmount')} ({editingGoal?.currency || currency})<input name="savedAmount" type="number" min="0" step="0.01" defaultValue={editingGoal?.saved_amount || '0'} required /></label>
              <label>{t('form.targetDate')}<input name="targetDate" type="date" defaultValue={editingGoal?.target_date || ''} /></label>
            </>}
            {modalType === 'budget' && <>
              <label>{t('form.expenseCategory')}<select name="categoryId" defaultValue={editingBudget?.category_id || ''} required>{categories.filter((category) => category.category_type === 'expense').map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select></label>
              <label>{t('form.limitAmount')} ({editingBudget?.currency || currency})<input name="amount" type="number" min="0.01" step="0.01" defaultValue={editingBudget?.amount || ''} required /></label>
              <label>{t('form.periodStart')}<input name="periodStart" type="date" defaultValue={editingBudget?.period_start || budgetPeriod.start} required /></label>
              <label>{t('form.periodEnd')}<input name="periodEnd" type="date" defaultValue={editingBudget?.period_end || budgetPeriod.end} required /></label>
            </>}
            {modalType === 'category' && <>
              <label>{t('form.categoryName')}<input name="name" maxLength="60" required /></label>
              <label>{t('form.categoryType')}<select name="categoryType" defaultValue="expense"><option value="expense">{t('form.expense')}</option><option value="income">{t('form.income')}</option></select></label>
            </>}
            {formError && <p className="form-message form-error" role="alert">{formError}</p>}
            <div className="modal-actions"><button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>{t('common.cancel')}</button><button className="primary-button" type="submit" disabled={saving}>{saving && <span className="inline-spinner" aria-hidden="true" />}{saving ? t('common.saving') : modalType === 'category' ? t('form.createCategoryAction') : t('common.save')}</button></div>
          </form>
        </section>
      </div>}
    </div>
  )
}

export default App
