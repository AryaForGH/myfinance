import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../context/AuthContext.js'
import { useI18n } from '../context/I18nContext.js'
import { financeService } from '../services/financeService.js'
import { formatCurrency, formatDate } from '../lib/preferences.js'

function Icon({ name, size = 18 }) {
  const paths = {
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
    account: <><rect x="3" y="5" width="18" height="15" rx="3" /><path d="M3 9h18M16 15h.01" /></>,
    transaction: <><path d="M16 3l4 4-4 4M4 7h16M8 21l-4-4 4-4m12 4H4" /></>,
    income: <><path d="M12 19V5m-6 6 6-6 6 6" /></>,
    expense: <><path d="M12 5v14m6-6-6 6-6-6" /></>,
    transfer: <><path d="M4 7h15l-3-3m4 13H5l3 3" /></>,
    edit: <><path d="m15 5 4 4M4 20l4-.8L19 8a2.8 2.8 0 0 0-4-4L4 15l-.8 4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2" /></>,
  }
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>
}

function dateLabel(value, locale, options = { dateStyle: 'medium', timeStyle: 'short' }) {
  return value ? formatDate(value, locale, options) : ''
}

function LoadingRows() {
  return <div className="record-list-skeleton" aria-label="Loading">
    {[0, 1, 2, 3].map((item) => <span key={item} />)}
  </div>
}

export default function TransactionsAccountsPages({
  page,
  detailId,
  detailKind,
  onNavigate,
  onOpenModal,
  onDeleteTransaction,
  onDeleteRecord,
  onToggleArchive,
  search,
  refreshVersion,
}) {
  const { user } = useAuth()
  const { locale, t } = useI18n()
  const [loaded, setLoaded] = useState({ key: '', data: null, error: '' })
  const [reloadTick, setReloadTick] = useState(0)
  const isTransaction = page === 'Transactions' || page === 'TransactionDetail'
  const key = `${user?.id || ''}:${page}:${detailId || ''}:${detailKind || ''}:${reloadTick}:${refreshVersion}`
  const isLoading = loaded.key !== key
  const data = loaded.key === key ? loaded.data : null
  const error = loaded.key === key ? loaded.error : ''

  useEffect(() => {
    if (!user?.id || !['Transactions', 'Accounts', 'TransactionDetail', 'AccountDetail'].includes(page)) return undefined
    let active = true
    const request = page === 'Transactions'
      ? financeService.getTransactions(user.id)
      : page === 'Accounts'
        ? financeService.getAccounts(user.id)
        : page === 'TransactionDetail'
          ? financeService.getTransactionDetails(user.id, detailId, detailKind)
          : financeService.getAccountDetails(user.id, detailId)
    request.then((value) => {
      if (active) setLoaded({ key, data: value, error: '' })
    }).catch((loadError) => {
      if (active) setLoaded({ key, data: null, error: loadError.message || t('records.loadFailed') })
    })
    return () => { active = false }
  }, [user?.id, page, detailId, detailKind, key, refreshVersion, t])

  const entries = useMemo(() => {
    const list = data || []
    const query = String(search || '').trim().toLocaleLowerCase()
    if (!query) return list
    return list.filter((item) => [
      item.description,
      item.merchant,
      item.category_name,
      item.account_name,
      item.to_account_name,
      item.notes,
      item.amount,
    ].join(' ').toLocaleLowerCase().includes(query))
  }, [data, search])

  const goBack = () => onNavigate(isTransaction ? 'Transactions' : 'Accounts')
  if (isLoading) return <section className="records-page"><LoadingRows /></section>
  if (error) return <section className="records-page"><div className="records-empty surface-card" role="alert"><p>{error}</p><button className="secondary-button" type="button" onClick={() => setReloadTick((value) => value + 1)}>{t('common.retry')}</button></div></section>

  if (page === 'Transactions') return <section className="records-page">
    <header className="records-heading">
      <div><h1>{t('nav.transactions')}</h1><p>{t('dashboard.activitySubtitle')}</p></div>
      <button className="primary-button" type="button" onClick={() => onOpenModal('transaction')}><Icon name="transaction" size={16} /> {t('dashboard.addTransaction')}</button>
    </header>
    {entries.length ? <div className="surface-card records-table">
      <div className="records-table-header"><span>{t('dashboard.name')}</span><span>{t('dashboard.category')}</span><span>{t('dashboard.date')}</span><span>{t('dashboard.amount')}</span><span /></div>
      {entries.map((entry) => <div className="records-table-row" key={`${entry.activity_kind}-${entry.id}`}>
        <button className="records-primary-cell" type="button" onClick={() => onNavigate('TransactionDetail', entry.id, entry.activity_kind)}>
          <span className={`transaction-icon ${entry.transaction_type === 'income' ? 'blue' : entry.transaction_type === 'transfer' ? 'lavender' : 'mint'}`}><Icon name={entry.transaction_type === 'income' ? 'income' : entry.transaction_type === 'transfer' ? 'transfer' : 'expense'} size={16} /></span>
          <span><strong>{entry.description || t('form.transfer')}</strong><small>{entry.account_name}{entry.transaction_type === 'transfer' ? ` → ${entry.to_account_name}` : ''}</small></span>
        </button>
        <span className="records-category">{entry.transaction_type === 'transfer' ? t('form.transfer') : entry.category_name || t('form.uncategorized')}</span>
        <span className="records-date">{dateLabel(entry.occurred_at, locale)}</span>
        <strong className={`records-amount ${entry.transaction_type}`}>{entry.transaction_type === 'income' ? '+' : entry.transaction_type === 'expense' ? '−' : ''}{formatCurrency(entry.amount, entry.account_currency, locale)}</strong>
        <span className="records-actions">
          {entry.activity_kind !== 'transfer' && <button className="icon-button row-more" type="button" aria-label={t('form.editRecord', { name: entry.description })} onClick={() => onOpenModal('transaction', entry)}><Icon name="edit" size={15} /></button>}
          <button className="icon-button row-more" type="button" aria-label={t('form.deleteRecord', { name: entry.description || t('form.transfer') })} onClick={() => onDeleteTransaction(entry)}><Icon name="trash" size={15} /></button>
        </span>
      </div>)}
    </div> : <div className="records-empty surface-card"><span className="goal-budget-card-icon budget-icon-color"><Icon name="transaction" /></span><h2>{t(search ? 'records.noSearchResults' : 'dashboard.noTransactions')}</h2><p>{search ? t('dashboard.noSearchResults', { query: search }) : t('records.emptyTransactionsDescription')}</p><button className="primary-button" type="button" onClick={() => onOpenModal('transaction')}>{t('dashboard.addTransaction')}</button></div>}
  </section>

  if (page === 'Accounts') return <section className="records-page">
    <header className="records-heading">
      <div><h1>{t('dashboard.yourAccounts')}</h1><p>{t('dashboard.accountBalances')}</p></div>
      <button className="primary-button" type="button" onClick={() => onOpenModal('account')}><Icon name="account" size={16} /> {t('form.addAccount')}</button>
    </header>
    {data?.length ? <div className="records-account-grid">{data.map((account) => <button className="records-account-card surface-card" key={account.id} type="button" onClick={() => onNavigate('AccountDetail', account.id)}>
      <span className="goal-budget-card-icon budget-icon-color"><Icon name="account" /></span>
      <span className="records-account-name">{account.name}</span>
      <small>{t(`form.${account.account_type}`)} · {account.currency}{account.is_archived ? ` · ${t('dashboard.archived')}` : ''}</small>
      <strong>{formatCurrency(account.balance, account.currency, locale)}</strong>
      <span>{t('records.viewDetails')}</span>
    </button>)}</div> : <div className="records-empty surface-card"><span className="goal-budget-card-icon budget-icon-color"><Icon name="account" /></span><h2>{t('records.noAccounts')}</h2><p>{t('dashboard.startAccountDescription')}</p><button className="primary-button" type="button" onClick={() => onOpenModal('account')}>{t('form.addAccount')}</button></div>}
  </section>

  if (!data?.id) return <section className="records-page"><div className="records-empty surface-card" role="alert"><p>{t('records.notFound')}</p><button className="secondary-button" type="button" onClick={goBack}>{t('goalBudget.backToList')}</button></div></section>

  if (page === 'TransactionDetail') {
    const isTransfer = data.transaction_type === 'transfer'
    return <section className="records-page">
      <button className="goal-budget-back" type="button" onClick={goBack}><Icon name="back" /> {t('goalBudget.backToList')}</button>
      <header className="records-heading">
        <div><span className="goal-budget-eyebrow">{t('nav.transactions')}</span><h1>{data.description || t('form.transfer')}</h1><p>{dateLabel(data.occurred_at, locale)}</p></div>
        <div className="goal-budget-actions">
          {!isTransfer && <button className="secondary-button" type="button" onClick={() => onOpenModal('transaction', data)}><Icon name="edit" size={16} /> {t('records.edit')}</button>}
          <button className="danger-button" type="button" onClick={() => onDeleteTransaction(data)}><Icon name="trash" size={16} /> {t('records.delete')}</button>
        </div>
      </header>
      <article className="surface-card records-detail-card">
        <div className="records-detail-amount"><span>{t('dashboard.amount')}</span><strong className={data.transaction_type}>{data.transaction_type === 'income' ? '+' : data.transaction_type === 'expense' ? '−' : ''}{formatCurrency(data.amount, data.account_currency, locale)}</strong></div>
        <dl className="records-details">
          <div><dt>{t('form.type')}</dt><dd>{t(data.transaction_type === 'income' ? 'form.income' : data.transaction_type === 'expense' ? 'form.expense' : 'form.transfer')}</dd></div>
          <div><dt>{isTransfer ? t('form.fromAccount') : t('form.account')}</dt><dd>{data.account_name}</dd></div>
          {isTransfer
            ? <div><dt>{t('form.toAccount')}</dt><dd>{data.to_account_name}</dd></div>
            : <div><dt>{t('form.category')}</dt><dd>{data.category_name || t('form.uncategorized')}</dd></div>}
          {data.merchant && <div><dt>{t('records.merchant')}</dt><dd>{data.merchant}</dd></div>}
          {data.notes && <div><dt>{t('form.notes')}</dt><dd>{data.notes}</dd></div>}
          <div><dt>{t('records.created')}</dt><dd>{dateLabel(data.created_at || data.occurred_at, locale)}</dd></div>
        </dl>
      </article>
    </section>
  }

  return <section className="records-page">
    <button className="goal-budget-back" type="button" onClick={goBack}><Icon name="back" /> {t('goalBudget.backToList')}</button>
    <header className="records-heading">
      <div><span className="goal-budget-eyebrow">{t('nav.accounts')}</span><h1>{data.name}</h1><p>{t(`form.${data.account_type}`)} · {data.currency}{data.is_archived ? ` · ${t('dashboard.archived')}` : ''}</p></div>
      <div className="goal-budget-actions">
        <button className="secondary-button" type="button" onClick={() => onOpenModal('account', data)}><Icon name="edit" size={16} /> {t('records.edit')}</button>
        <button className="secondary-button" type="button" onClick={() => onToggleArchive(data)}>{t(data.is_archived ? 'form.unarchiveAccount' : 'form.archiveAccount', { name: data.name })}</button>
        <button className="danger-button" type="button" onClick={() => onDeleteRecord('account', data)}><Icon name="trash" size={16} /> {t('records.delete')}</button>
      </div>
    </header>
    <div className="records-account-summary-grid">
      <article className="surface-card records-account-summary"><span>{t('dashboard.totalBalance')}</span><strong>{formatCurrency(data.balance, data.currency, locale)}</strong></article>
      <article className="surface-card records-account-summary"><span>{t('form.openingBalance')}</span><strong>{formatCurrency(data.opening_balance, data.currency, locale)}</strong></article>
      <article className="surface-card records-account-summary"><span>{t('records.activityCount')}</span><strong>{data.activity.length}</strong></article>
    </div>
    <article className="surface-card records-detail-card">
      <h2>{t('records.accountActivity')}</h2>
      {data.activity.length ? <div className="goal-budget-history">{data.activity.map((entry) => <div className="goal-budget-history-row" key={`${entry.activity_kind}-${entry.id}-${entry.flow}`}>
        <span className={`goal-budget-history-icon ${entry.flow === 'in' ? 'add' : 'expense'}`}><Icon name={entry.activity_kind === 'transfer' ? 'transfer' : entry.transaction_type === 'income' ? 'income' : 'expense'} size={16} /></span>
        <span><strong>{entry.description || t('form.transfer')}</strong><small>{dateLabel(entry.occurred_at, locale)} · {entry.activity_kind === 'transfer' ? `${entry.flow === 'in' ? t('records.transferFrom') : t('records.transferTo')} ${entry.counterparty_name}` : entry.category_name || t('form.uncategorized')}</small></span>
        <strong className={entry.flow === 'in' ? 'is-income' : 'is-expense'}>{entry.flow === 'in' ? '+' : '−'}{formatCurrency(entry.amount, data.currency, locale)}</strong>
      </div>)}</div> : <p className="goal-budget-empty-inline">{t('records.noAccountActivity')}</p>}
    </article>
  </section>
}
