import { useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext.js'
import { useI18n } from '../context/I18nContext.js'
import { useToast } from '../context/useToast.js'
import { financeService } from '../services/financeService.js'
import { formatCurrency, formatDate } from '../lib/preferences.js'

function Icon({ name, size = 18 }) {
  const paths = {
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
    target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
    budget: <><path d="M4 19V5M4 19h17" /><path d="m7 15 4-4 3 2 5-6" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function dateLabel(value, locale) {
  return value ? formatDate(`${value}T00:00:00`, locale, { year: 'numeric', month: 'short', day: 'numeric' }) : ''
}

function budgetPeriodLength(budget) {
  const start = new Date(`${budget.period_start}T00:00:00.000Z`)
  const end = new Date(`${budget.period_end}T00:00:00.000Z`)
  return Math.round((end.getTime() - start.getTime()) / 86400000) + 1
}

function Progress({ value, tone = 'goal' }) {
  const progress = Math.max(0, Number(value) || 0)
  return <div className={`goal-budget-progress ${tone}`} role="progressbar" aria-valuenow={Math.min(100, Math.round(progress))} aria-valuemin="0" aria-valuemax="100">
    <span style={{ width: `${Math.min(100, progress)}%` }} />
  </div>
}

function LoadingCards() {
  return <div className="goal-budget-grid" aria-label="Loading">
    {[0, 1, 2].map((item) => <div className="goal-budget-skeleton" key={item}><span /><span /><span /></div>)}
  </div>
}

export default function GoalBudgetPages({
  page,
  detailId,
  onNavigate,
  onOpenModal,
  onDelete,
  onRefresh,
  refreshVersion,
}) {
  const { user } = useAuth()
  const { locale, t } = useI18n()
  const { notify } = useToast()
  const [loaded, setLoaded] = useState({ key: '', data: null, error: '' })
  const [reloadTick, setReloadTick] = useState(0)
  const [activityType, setActivityType] = useState('add')
  const [activityAmount, setActivityAmount] = useState('')
  const [activityNote, setActivityNote] = useState('')
  const [activitySaving, setActivitySaving] = useState(false)
  const isGoal = page === 'Goals' || page === 'GoalDetail'
  const isDetail = page === 'GoalDetail' || page === 'BudgetDetail'
  const key = `${user?.id || ''}:${page}:${detailId || ''}:${reloadTick}:${refreshVersion}`
  const isLoading = loaded.key !== key
  const error = loaded.key === key ? loaded.error : ''
  const data = loaded.key === key ? loaded.data : null

  useEffect(() => {
    if (!user?.id || !['Goals', 'Budgets', 'GoalDetail', 'BudgetDetail'].includes(page)) return undefined
    let active = true
    const request = page === 'Goals'
      ? financeService.getGoals(user.id)
      : page === 'Budgets'
        ? financeService.getBudgets(user.id)
        : page === 'GoalDetail'
          ? financeService.getGoalDetails(user.id, detailId)
          : financeService.getBudgetDetails(user.id, detailId)
    request.then((value) => {
      if (active) setLoaded({ key, data: value, error: '' })
    }).catch((loadError) => {
      if (active) setLoaded({ key, data: null, error: loadError.message || t('goalBudget.loadFailed') })
    })
    return () => { active = false }
  }, [user?.id, page, detailId, key, refreshVersion, t])

  async function reload() {
    await onRefresh()
    setReloadTick((current) => current + 1)
  }

  async function submitActivity(event) {
    event.preventDefault()
    if (activitySaving || !data?.id) return
    setActivitySaving(true)
    try {
      await financeService.adjustGoalSavings(user.id, data.id, activityType, activityAmount, activityNote)
      setActivityAmount('')
      setActivityNote('')
      await reload()
      notify('success', t(activityType === 'add' ? 'goalBudget.savingsAdded' : 'goalBudget.savingsWithdrawn'))
    } catch (saveError) {
      notify('error', saveError.message || t('goalBudget.saveFailed'))
    } finally {
      setActivitySaving(false)
    }
  }

  const returnToList = () => onNavigate(isGoal ? 'Goals' : 'Budgets')
  if (isLoading) return <section className="goal-budget-page"><LoadingCards /></section>
  if (error) return <section className="goal-budget-page"><div className="goal-budget-error" role="alert"><p>{error}</p><button className="secondary-button" type="button" onClick={() => setReloadTick((current) => current + 1)}>{t('common.retry')}</button></div></section>

  if (!isDetail) {
    const entries = data || []
    const title = isGoal ? t('nav.goals') : t('nav.budgets')
    const description = isGoal ? t('goalBudget.goalsSubtitle') : t('goalBudget.budgetsSubtitle')
    return <section className="goal-budget-page">
      <header className="goal-budget-heading">
        <div><h1>{title}</h1><p>{description}</p></div>
        <button className="primary-button" type="button" onClick={() => onOpenModal(isGoal ? 'goal' : 'budget')}><Icon name="plus" size={16} /> {t(isGoal ? 'dashboard.createGoal' : 'dashboard.addBudget')}</button>
      </header>
      {entries.length ? <div className="goal-budget-grid">
        {entries.map((item) => {
          const progress = isGoal
            ? Number(item.target_amount) > 0 ? Number(item.saved_amount) / Number(item.target_amount) * 100 : 0
            : Number(item.amount) > 0 ? Number(item.spent || 0) / Number(item.amount) * 100 : 0
          const remaining = isGoal
            ? Math.max(0, Number(item.target_amount) - Number(item.saved_amount))
            : Number(item.amount) - Number(item.spent || 0)
          return <button
            className="goal-budget-card surface-card"
            key={item.id}
            type="button"
            onClick={() => onNavigate(isGoal ? 'GoalDetail' : 'BudgetDetail', item.id)}
          >
            <span className={`goal-budget-card-icon ${isGoal ? 'goal-icon-color' : 'budget-icon-color'}`}><Icon name={isGoal ? 'target' : 'budget'} /></span>
            <span className="goal-budget-card-title">{isGoal ? item.name : item.category_name}</span>
            <span className="goal-budget-card-subtitle">{isGoal ? item.description || t('goalBudget.noDescription') : `${t(budgetPeriodLength(item) === 1 ? 'goalBudget.daily' : budgetPeriodLength(item) === 7 ? 'goalBudget.weekly' : budgetPeriodLength(item) >= 28 && budgetPeriodLength(item) <= 31 ? 'goalBudget.monthly' : 'goalBudget.custom')} · ${dateLabel(item.period_start, locale)} – ${dateLabel(item.period_end, locale)}`}</span>
            <Progress value={progress} tone={!isGoal && progress > 100 ? 'danger' : !isGoal && progress >= 70 ? 'warning' : 'goal'} />
            <span className="goal-budget-percent">{Math.round(progress)}%</span>
            <span className="goal-budget-card-amounts">
              <span>{isGoal ? t('goalBudget.saved') : t('goalBudget.spent')}<strong>{formatCurrency(isGoal ? item.saved_amount : item.spent || 0, item.currency, locale)}</strong></span>
              <span>{isGoal ? t('goalBudget.target') : t('goalBudget.limit')}<strong>{formatCurrency(isGoal ? item.target_amount : item.amount, item.currency, locale)}</strong></span>
            </span>
            <span className="goal-budget-card-footer">
              <span>{isGoal ? t('goalBudget.remaining') : t('goalBudget.remaining')}</span>
              <strong>{formatCurrency(remaining, item.currency, locale)}</strong>
              {isGoal && item.target_date && <small>{t('goalBudget.targetDate')}: {dateLabel(item.target_date, locale)}</small>}
              {!isGoal && <small>{t(progress > 100 ? 'goalBudget.overBudget' : progress >= 70 ? 'goalBudget.budgetWarning' : 'goalBudget.budgetSafe')}</small>}
            </span>
          </button>
        })}
      </div> : <div className="goal-budget-empty surface-card">
        <span className={`goal-budget-card-icon ${isGoal ? 'goal-icon-color' : 'budget-icon-color'}`}><Icon name={isGoal ? 'target' : 'budget'} /></span>
        <h2>{t(isGoal ? 'goalBudget.noGoals' : 'goalBudget.noBudgets')}</h2>
        <p>{t(isGoal ? 'goalBudget.emptyGoalsDescription' : 'goalBudget.emptyBudgetsDescription')}</p>
        <button className="primary-button" type="button" onClick={() => onOpenModal(isGoal ? 'goal' : 'budget')}><Icon name="plus" size={16} /> {t(isGoal ? 'dashboard.createGoal' : 'dashboard.addBudget')}</button>
      </div>}
    </section>
  }

  if (!data?.id) return <section className="goal-budget-page"><div className="goal-budget-error" role="alert"><p>{t('goalBudget.notFound')}</p><button className="secondary-button" type="button" onClick={returnToList}>{t('goalBudget.backToList')}</button></div></section>

  if (page === 'GoalDetail') {
    const progress = Number(data.target_amount) > 0 ? Number(data.saved_amount) / Number(data.target_amount) * 100 : 0
    const achieved = Number(data.saved_amount) >= Number(data.target_amount)
    return <section className="goal-budget-page">
      <button className="goal-budget-back" type="button" onClick={returnToList}><Icon name="back" /> {t('goalBudget.backToList')}</button>
      <header className="goal-budget-heading goal-budget-detail-heading">
        <div><span className="goal-budget-eyebrow">{t('nav.goals')}</span><h1>{data.name}</h1><p>{data.description || t('goalBudget.noDescription')}</p></div>
        <div className="goal-budget-actions">
          <button className="secondary-button" type="button" onClick={() => onOpenModal('goal', data)}><Icon name="edit" size={16} /> {t('goalBudget.edit')}</button>
          <button className="danger-button" type="button" onClick={() => onDelete('goal', data)}><Icon name="trash" size={16} /> {t('goalBudget.delete')}</button>
        </div>
      </header>
      <div className="goal-budget-summary-grid">
        <article className="surface-card goal-budget-summary"><span>{t('goalBudget.target')}</span><strong>{formatCurrency(data.target_amount, data.currency, locale)}</strong>{data.target_date && <small>{t('goalBudget.targetDate')}: {dateLabel(data.target_date, locale)}</small>}</article>
        <article className="surface-card goal-budget-summary"><span>{t('goalBudget.saved')}</span><strong>{formatCurrency(data.saved_amount, data.currency, locale)}</strong><small>{achieved ? t('goalBudget.goalAchieved') : t('goalBudget.remaining') + ': ' + formatCurrency(Math.max(0, Number(data.target_amount) - Number(data.saved_amount)), data.currency, locale)}</small></article>
        <article className="surface-card goal-budget-summary"><span>{t('goalBudget.progress')}</span><strong>{Math.round(progress)}%</strong><Progress value={progress} /></article>
      </div>
      <div className="goal-budget-detail-grid">
        <article className="surface-card goal-budget-panel">
          <h2>{t('goalBudget.manageSavings')}</h2>
          <form className="data-form goal-budget-form" onSubmit={submitActivity}>
            <label>{t('goalBudget.activityType')}<select value={activityType} onChange={(event) => setActivityType(event.target.value)}><option value="add">{t('goalBudget.addSavings')}</option><option value="withdraw">{t('goalBudget.withdrawSavings')}</option></select></label>
            <label>{t('goalBudget.amount')} ({data.currency})<input type="number" min="0.01" max="9999999999999.99" step="0.01" value={activityAmount} onChange={(event) => setActivityAmount(event.target.value)} required /></label>
            <label>{t('goalBudget.note')}<input type="text" maxLength="500" value={activityNote} onChange={(event) => setActivityNote(event.target.value)} /></label>
            <button className="primary-button" type="submit" disabled={activitySaving}>{activitySaving && <span className="inline-spinner" aria-hidden="true" />}{activitySaving ? t('common.saving') : t('goalBudget.saveActivity')}</button>
          </form>
        </article>
        <article className="surface-card goal-budget-panel">
          <h2>{t('goalBudget.savingsHistory')}</h2>
          {data.activity.length ? <div className="goal-budget-history">{data.activity.map((entry) => <div className="goal-budget-history-row" key={entry.id}>
            <span className={`goal-budget-history-icon ${entry.activity_type}`}><Icon name={entry.activity_type === 'add' ? 'plus' : 'budget'} size={16} /></span>
            <span><strong>{t(entry.activity_type === 'add' ? 'goalBudget.added' : 'goalBudget.withdrawn')}</strong><small>{formatDate(entry.created_at, locale, { dateStyle: 'medium', timeStyle: 'short' })}{entry.note ? ` · ${entry.note}` : ''}</small></span>
            <strong className={entry.activity_type === 'add' ? 'is-income' : 'is-expense'}>{entry.activity_type === 'add' ? '+' : '−'}{formatCurrency(entry.amount, data.currency, locale)}</strong>
          </div>)}</div> : <p className="goal-budget-empty-inline">{t('goalBudget.noActivity')}</p>}
        </article>
      </div>
    </section>
  }

  const progress = Number(data.amount) > 0 ? Number(data.spent) / Number(data.amount) * 100 : 0
  const remaining = Number(data.amount) - Number(data.spent)
  const tone = progress > 100 ? 'danger' : progress >= 70 ? 'warning' : 'safe'
  return <section className="goal-budget-page">
    <button className="goal-budget-back" type="button" onClick={returnToList}><Icon name="back" /> {t('goalBudget.backToList')}</button>
    <header className="goal-budget-heading goal-budget-detail-heading">
      <div><span className="goal-budget-eyebrow">{t('nav.budgets')}</span><h1>{data.category_name}</h1><p>{dateLabel(data.period_start, locale)} – {dateLabel(data.period_end, locale)}</p></div>
      <div className="goal-budget-actions">
        <button className="secondary-button" type="button" onClick={() => onOpenModal('budget', data)}><Icon name="edit" size={16} /> {t('goalBudget.edit')}</button>
        <button className="danger-button" type="button" onClick={() => onDelete('budget', data)}><Icon name="trash" size={16} /> {t('goalBudget.delete')}</button>
      </div>
    </header>
    <div className="goal-budget-summary-grid">
      <article className="surface-card goal-budget-summary"><span>{t('goalBudget.limit')}</span><strong>{formatCurrency(data.amount, data.currency, locale)}</strong></article>
      <article className="surface-card goal-budget-summary"><span>{t('goalBudget.spent')}</span><strong>{formatCurrency(data.spent, data.currency, locale)}</strong></article>
      <article className={`surface-card goal-budget-summary ${tone}`}><span>{t('goalBudget.remaining')}</span><strong>{formatCurrency(remaining, data.currency, locale)}</strong><small>{t(progress > 100 ? 'goalBudget.overBudget' : progress >= 70 ? 'goalBudget.budgetWarning' : 'goalBudget.budgetSafe')}</small></article>
    </div>
    <article className="surface-card goal-budget-panel budget-detail-progress"><div><h2>{t('goalBudget.usage')}</h2><strong>{Math.round(progress)}%</strong></div><Progress value={progress} tone={tone} /></article>
    <article className="surface-card goal-budget-panel">
      <h2>{t('goalBudget.budgetTransactions')}</h2>
      {data.transactions.length ? <div className="goal-budget-history">{data.transactions.map((transaction) => <div className="goal-budget-history-row" key={transaction.id}>
        <span className="goal-budget-history-icon expense"><Icon name="budget" size={16} /></span>
        <span><strong>{transaction.description}</strong><small>{formatDate(transaction.occurred_at, locale, { dateStyle: 'medium' })} · {transaction.account_name}</small></span>
        <strong className="is-expense">−{formatCurrency(transaction.amount, data.currency, locale)}</strong>
      </div>)}</div> : <p className="goal-budget-empty-inline">{t('goalBudget.noBudgetTransactions')}</p>}
    </article>
  </section>
}
