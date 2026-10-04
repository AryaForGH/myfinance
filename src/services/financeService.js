import { supabase } from '../lib/supabase.js'
import { CURRENCIES } from '../lib/preferences.js'

const MAX_AMOUNT = 9999999999999.99
const CURRENCY_CODES = new Set(CURRENCIES.map(({ code }) => code))

function requireText(value, label, maxLength) {
  const normalized = String(value ?? '').trim()
  if (!normalized) throw new Error(`${label} is required.`)
  if (normalized.length > maxLength) {
    throw new Error(`${label} must be ${maxLength} characters or fewer.`)
  }
  return normalized
}

function requireCurrency(value) {
  if (!CURRENCY_CODES.has(value)) {
    throw new Error('Choose a supported currency.')
  }
  return value
}

function requireAmount(value, label = 'Amount') {
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
    throw new Error(`${label} must be greater than zero.`)
  }
  return Math.round(amount * 100) / 100
}

function requireDate(value, label) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) {
    throw new Error(`${label} must be a valid date.`)
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} must be a valid date.`)
  }
  return value
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function checkError(error) {
  if (!error) return
  if (error.code === '23503') {
    throw new Error('This item is still used by financial records. Archive the account or remove the linked records first.')
  }
  if (error.code === '23505') {
    throw new Error('A record with the same name, period, or request identifier already exists.')
  }
  if (error.code === '42501') {
    throw new Error('You are not allowed to access this data. Please sign in again.')
  }
  if (error.code === 'PGRST116') {
    throw new Error('The record was not found or is no longer available to your account.')
  }
  throw new Error(error.message || 'The request could not be completed.')
}

async function fetchAllRows(queryFactory) {
  const pageSize = 1000
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await queryFactory().range(offset, offset + pageSize - 1)
    checkError(error)
    rows.push(...data)
    if (data.length < pageSize) return rows
  }
}

function requireUserId(userId) {
  if (!userId) throw new Error('Sign in to access your financial data.')
  return userId
}

function transactionRow(row, accountsById, categoriesById) {
  const account = accountsById.get(row.account_id)
  return {
    ...row,
    account_name: account?.name || '',
    account_currency: account?.currency || '',
    category_name: categoriesById.get(row.category_id)?.name || null,
    to_account_id: null,
    to_account_name: null,
    to_account_currency: null,
  }
}

export const financeService = {
  async getDashboard() {
    const [dashboardResult, categoriesResult] = await Promise.all([
      supabase.rpc('get_dashboard_data'),
      supabase.from('categories')
        .select('id, name, category_type, icon')
        .order('category_type')
        .order('name'),
    ])
    checkError(dashboardResult.error)
    checkError(categoriesResult.error)
    if (!dashboardResult.data) {
      throw new Error('The dashboard data could not be loaded.')
    }
    return { ...dashboardResult.data, categories: categoriesResult.data ?? [] }
  },

  async createAccount(userId, input) {
    const ownerId = requireUserId(userId)
    const name = requireText(input.name, 'Account name', 80)
    if (!['checking', 'savings', 'cash'].includes(input.accountType)) {
      throw new Error('Choose a valid account type.')
    }
    const openingBalance = input.openingBalance === '' || input.openingBalance == null
      ? 0
      : Number(input.openingBalance)
    if (!Number.isFinite(openingBalance) || openingBalance < 0 || openingBalance > MAX_AMOUNT) {
      throw new Error('Opening balance must be zero or a positive amount.')
    }
    const { data, error } = await supabase.from('accounts').insert({
      user_id: ownerId,
      name,
      account_type: input.accountType,
      currency: requireCurrency(input.currency),
      opening_balance: Math.round(openingBalance * 100) / 100,
    }).select('id').single()
    checkError(error)
    return data
  },

  async updateAccount(userId, accountId, input) {
    const ownerId = requireUserId(userId)
    const { data, error } = await supabase.from('accounts')
      .update({
        name: requireText(input.name, 'Account name', 80),
        account_type: input.accountType,
        is_archived: Boolean(input.isArchived),
      })
      .eq('user_id', ownerId)
      .eq('id', accountId)
      .select('id')
      .single()
    checkError(error)
    return data
  },

  async deleteAccount(userId, accountId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('accounts')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', accountId)
      .select('id')
      .single()
    checkError(error)
  },

  async getAccounts(userId) {
    const ownerId = requireUserId(userId)
    const [accountsResult, transactions, transfers] = await Promise.all([
      supabase.from('accounts')
        .select('id, name, account_type, currency, opening_balance, is_archived, created_at')
        .eq('user_id', ownerId)
        .order('created_at', { ascending: false }),
      fetchAllRows(() => supabase.from('transactions')
        .select('account_id, transaction_type, amount')
        .eq('user_id', ownerId)
        .order('id')),
      fetchAllRows(() => supabase.from('transfers')
        .select('from_account_id, to_account_id, amount')
        .eq('user_id', ownerId)
        .order('id')),
    ])
    checkError(accountsResult.error)
    const balances = new Map(accountsResult.data.map((account) => [account.id, Number(account.opening_balance)]))
    for (const transaction of transactions) {
      const sign = transaction.transaction_type === 'income' ? 1 : -1
      balances.set(transaction.account_id, (balances.get(transaction.account_id) || 0) + sign * Number(transaction.amount))
    }
    for (const transfer of transfers) {
      balances.set(transfer.from_account_id, (balances.get(transfer.from_account_id) || 0) - Number(transfer.amount))
      balances.set(transfer.to_account_id, (balances.get(transfer.to_account_id) || 0) + Number(transfer.amount))
    }
    return accountsResult.data.map((account) => ({ ...account, balance: balances.get(account.id) || 0 }))
  },

  async getAccountDetails(userId, accountId) {
    const ownerId = requireUserId(userId)
    const [accountResult, transactions, outgoingTransfers, incomingTransfers] = await Promise.all([
      supabase.from('accounts')
        .select('id, name, account_type, currency, opening_balance, is_archived, created_at')
        .eq('user_id', ownerId)
        .eq('id', accountId)
        .single(),
      fetchAllRows(() => supabase.from('transactions')
        .select('id, account_id, category_id, transaction_type, amount, description, merchant, occurred_at, notes, created_at')
        .eq('user_id', ownerId)
        .eq('account_id', accountId)
        .order('occurred_at', { ascending: false })
        .order('id')),
      fetchAllRows(() => supabase.from('transfers')
        .select('id, from_account_id, to_account_id, amount, description, occurred_at, created_at')
        .eq('user_id', ownerId)
        .eq('from_account_id', accountId)
        .order('occurred_at', { ascending: false })
        .order('id')),
      fetchAllRows(() => supabase.from('transfers')
        .select('id, from_account_id, to_account_id, amount, description, occurred_at, created_at')
        .eq('user_id', ownerId)
        .eq('to_account_id', accountId)
        .order('occurred_at', { ascending: false })
        .order('id')),
    ])
    checkError(accountResult.error)
    const { data: relatedAccounts, error: relatedAccountsError } = await supabase.from('accounts')
      .select('id, name, currency')
      .eq('user_id', ownerId)
    checkError(relatedAccountsError)
    const { data: categories, error: categoriesError } = await supabase.from('categories')
      .select('id, name')
      .eq('user_id', ownerId)
    checkError(categoriesError)
    const accountsById = new Map(relatedAccounts.map((account) => [account.id, account]))
    const categoriesById = new Map(categories.map((category) => [category.id, category.name]))
    const activity = [
      ...transactions.map((transaction) => ({
        ...transactionRow(transaction, accountsById, categoriesById),
        activity_kind: 'transaction',
        flow: transaction.transaction_type === 'income' ? 'in' : 'out',
      })),
      ...[...outgoingTransfers, ...incomingTransfers].map((transfer) => {
        const isIncoming = transfer.to_account_id === accountId
        const otherAccountId = isIncoming ? transfer.from_account_id : transfer.to_account_id
        const otherAccount = accountsById.get(otherAccountId)
        return {
          ...transfer,
          transaction_type: 'transfer',
          activity_kind: 'transfer',
          flow: isIncoming ? 'in' : 'out',
          account_id: isIncoming ? transfer.to_account_id : transfer.from_account_id,
          account_name: isIncoming ? accountsById.get(accountId)?.name : accountsById.get(accountId)?.name,
          account_currency: accountsById.get(accountId)?.currency || '',
          to_account_id: isIncoming ? accountId : otherAccountId,
          to_account_name: otherAccount?.name || '',
          to_account_currency: otherAccount?.currency || '',
          counterparty_name: otherAccount?.name || '',
          category_name: null,
          merchant: null,
          notes: null,
        }
      }),
    ].sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at))
    const balance = activity.reduce((total, item) => total + (item.flow === 'in' ? 1 : -1) * Number(item.amount), Number(accountResult.data.opening_balance))
    return { ...accountResult.data, balance, activity }
  },

  async getTransactions(userId) {
    const ownerId = requireUserId(userId)
    const [accountsResult, categoriesResult, transactions, transfers] = await Promise.all([
      supabase.from('accounts').select('id, name, currency').eq('user_id', ownerId),
      supabase.from('categories').select('id, name').eq('user_id', ownerId),
      fetchAllRows(() => supabase.from('transactions')
        .select('id, account_id, category_id, transaction_type, amount, description, merchant, occurred_at, notes')
        .eq('user_id', ownerId)
        .order('occurred_at', { ascending: false })
        .order('id')),
      fetchAllRows(() => supabase.from('transfers')
        .select('id, from_account_id, to_account_id, amount, description, occurred_at')
        .eq('user_id', ownerId)
        .order('occurred_at', { ascending: false })
        .order('id')),
    ])
    checkError(accountsResult.error)
    checkError(categoriesResult.error)
    const accountsById = new Map(accountsResult.data.map((account) => [account.id, account]))
    const categoriesById = new Map(categoriesResult.data.map((category) => [category.id, category.name]))
    const entries = [
      ...transactions.map((transaction) => ({
        ...transactionRow(transaction, accountsById, categoriesById),
        activity_kind: 'transaction',
      })),
      ...transfers.map((transfer) => ({
        ...transfer,
        transaction_type: 'transfer',
        activity_kind: 'transfer',
        account_id: transfer.from_account_id,
        account_name: accountsById.get(transfer.from_account_id)?.name || '',
        account_currency: accountsById.get(transfer.from_account_id)?.currency || '',
        to_account_name: accountsById.get(transfer.to_account_id)?.name || '',
        to_account_currency: accountsById.get(transfer.to_account_id)?.currency || '',
        category_name: null,
        merchant: null,
        notes: null,
      })),
    ]
    return entries.sort((left, right) => new Date(right.occurred_at) - new Date(left.occurred_at))
  },

  async getTransactionDetails(userId, transactionId, kind = 'transaction') {
    const ownerId = requireUserId(userId)
    if (kind === 'transfer') {
      const { data: transfer, error } = await supabase.from('transfers')
        .select('id, from_account_id, to_account_id, amount, description, occurred_at, created_at')
        .eq('user_id', ownerId)
        .eq('id', transactionId)
        .single()
      checkError(error)
      const { data: accounts, error: accountsError } = await supabase.from('accounts')
        .select('id, name, currency')
        .eq('user_id', ownerId)
        .in('id', [transfer.from_account_id, transfer.to_account_id])
      checkError(accountsError)
      const accountsById = new Map(accounts.map((account) => [account.id, account]))
      return {
        ...transfer,
        transaction_type: 'transfer',
        activity_kind: 'transfer',
        account_name: accountsById.get(transfer.from_account_id)?.name || '',
        account_currency: accountsById.get(transfer.from_account_id)?.currency || '',
        to_account_name: accountsById.get(transfer.to_account_id)?.name || '',
        to_account_currency: accountsById.get(transfer.to_account_id)?.currency || '',
      }
    }

    const { data: transaction, error } = await supabase.from('transactions')
      .select('id, account_id, category_id, transaction_type, amount, description, merchant, occurred_at, notes, created_at')
      .eq('user_id', ownerId)
      .eq('id', transactionId)
      .single()
    checkError(error)
    const [accountResult, categoryResult] = await Promise.all([
      supabase.from('accounts').select('id, name, currency').eq('user_id', ownerId).eq('id', transaction.account_id).single(),
      transaction.category_id
        ? supabase.from('categories').select('id, name').eq('user_id', ownerId).eq('id', transaction.category_id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
    ])
    checkError(accountResult.error)
    checkError(categoryResult.error)
    return {
      ...transaction,
      transaction_currency: accountResult.data.currency,
      account_name: accountResult.data.name,
      account_currency: accountResult.data.currency,
      category_name: categoryResult.data?.name || null,
      activity_kind: 'transaction',
    }
  },

  async createCategory(userId, input) {
    const ownerId = requireUserId(userId)
    if (!['income', 'expense'].includes(input.categoryType)) {
      throw new Error('Choose a valid category type.')
    }
    const { data, error } = await supabase.from('categories').insert({
      user_id: ownerId,
      name: requireText(input.name, 'Category name', 60),
      category_type: input.categoryType,
      icon: input.icon || 'circle',
    }).select('id').single()
    checkError(error)
    return data
  },

  async updateCategory(userId, categoryId, input) {
    const ownerId = requireUserId(userId)
    const { data, error } = await supabase.from('categories').update({
      name: requireText(input.name, 'Category name', 60),
      icon: input.icon || 'circle',
    }).eq('user_id', ownerId).eq('id', categoryId).select('id').single()
    checkError(error)
    return data
  },

  async deleteCategory(userId, categoryId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('categories')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', categoryId)
      .select('id')
      .single()
    checkError(error)
  },

  async createTransaction(userId, input) {
    const ownerId = requireUserId(userId)
    if (!['income', 'expense'].includes(input.transactionType)) {
      throw new Error('Choose income or expense for a transaction.')
    }
    if (!input.accountId) throw new Error('Select an account.')
    const description = requireText(input.description, 'Description', 160)
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
    if (Number.isNaN(occurredAt.getTime())) throw new Error('Enter a valid transaction date.')
    const requestId = input.requestId || window.crypto.randomUUID()
    const payload = {
      user_id: ownerId,
      request_id: requestId,
      account_id: input.accountId,
      category_id: input.categoryId || null,
      transaction_type: input.transactionType,
      amount: requireAmount(input.amount),
      description,
      merchant: input.merchant?.trim() || null,
      occurred_at: occurredAt.toISOString(),
      notes: input.notes?.trim() || null,
    }
    const { data, error } = await supabase.from('transactions').insert(payload).select('id').single()
    if (error?.code === '23505') {
      const existing = await supabase.from('transactions')
        .select('id, account_id, category_id, transaction_type, amount, description, merchant, occurred_at, notes')
        .eq('user_id', ownerId)
        .eq('request_id', requestId)
        .maybeSingle()
      checkError(existing.error)
      if (
        existing.data
        && existing.data.account_id === payload.account_id
        && existing.data.category_id === payload.category_id
        && existing.data.transaction_type === payload.transaction_type
        && Number(existing.data.amount) === payload.amount
        && existing.data.description === payload.description
        && existing.data.merchant === payload.merchant
        && new Date(existing.data.occurred_at).getTime() === occurredAt.getTime()
        && existing.data.notes === payload.notes
      ) {
        return { id: existing.data.id }
      }
    }
    checkError(error)
    return data
  },

  async updateTransaction(userId, transactionId, input) {
    const ownerId = requireUserId(userId)
    if (!['income', 'expense'].includes(input.transactionType)) {
      throw new Error('Choose income or expense for a transaction.')
    }
    if (!input.accountId) throw new Error('Select an account.')
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
    if (Number.isNaN(occurredAt.getTime())) throw new Error('Enter a valid transaction date.')
    const { data, error } = await supabase.from('transactions').update({
      account_id: input.accountId,
      category_id: input.categoryId || null,
      transaction_type: input.transactionType,
      amount: requireAmount(input.amount),
      description: requireText(input.description, 'Description', 160),
      merchant: input.merchant?.trim() || null,
      occurred_at: occurredAt.toISOString(),
      notes: input.notes?.trim() || null,
    }).eq('user_id', ownerId).eq('id', transactionId).select('id').single()
    checkError(error)
    return data
  },

  async deleteTransaction(userId, transactionId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('transactions')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', transactionId)
      .select('id')
      .single()
    checkError(error)
  },

  async createTransfer(userId, input) {
    requireUserId(userId)
    if (!input.fromAccountId || !input.toAccountId) {
      throw new Error('Select a source and destination account.')
    }
    if (input.fromAccountId === input.toAccountId) {
      throw new Error('Choose two different accounts for a transfer.')
    }
    const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date()
    if (Number.isNaN(occurredAt.getTime())) throw new Error('Enter a valid transfer date.')
    const { data, error } = await supabase.rpc('create_transfer', {
      p_from_account_id: input.fromAccountId,
      p_to_account_id: input.toAccountId,
      p_amount: requireAmount(input.amount, 'Transfer amount'),
      p_description: input.description?.trim() || null,
      p_occurred_at: occurredAt.toISOString(),
      p_request_id: input.requestId || window.crypto.randomUUID(),
    })
    checkError(error)
    return data
  },

  async deleteTransfer(userId, transferId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('transfers')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', transferId)
      .select('id')
      .single()
    checkError(error)
  },

  async createBudget(userId, input) {
    const ownerId = requireUserId(userId)
    const periodStart = requireDate(input.periodStart, 'Budget start')
    const periodEnd = requireDate(input.periodEnd, 'Budget end')
    if (periodEnd < periodStart) {
      throw new Error('Choose a valid budget date range.')
    }
    const { data, error } = await supabase.from('budgets').insert({
      user_id: ownerId,
      category_id: input.categoryId,
      currency: requireCurrency(input.currency),
      amount: requireAmount(input.amount, 'Budget amount'),
      period_start: periodStart,
      period_end: periodEnd,
    }).select('id').single()
    checkError(error)
    return data
  },

  async getBudgets(userId) {
    const ownerId = requireUserId(userId)
    const { data, error } = await supabase.from('budgets')
      .select('id, category_id, amount, currency, period_start, period_end, created_at')
      .eq('user_id', ownerId)
      .order('period_start', { ascending: false })
    checkError(error)
    if (!data.length) return []
    const categoryIds = [...new Set(data.map((budget) => budget.category_id))]
    const { data: categories, error: categoriesError } = await supabase.from('categories')
      .select('id, name')
      .eq('user_id', ownerId)
      .in('id', categoryIds)
    checkError(categoriesError)
    const categoryNames = new Map(categories.map((category) => [category.id, category.name]))
    const earliestStart = data.reduce((earliest, item) => item.period_start < earliest ? item.period_start : earliest, data[0].period_start)
    const latestEnd = data.reduce((latest, item) => item.period_end > latest ? item.period_end : latest, data[0].period_end)
    const [accountsResult, transactions] = await Promise.all([
      supabase.from('accounts').select('id, currency').eq('user_id', ownerId),
      fetchAllRows(() => supabase.from('transactions')
        .select('category_id, account_id, amount, occurred_at')
        .eq('user_id', ownerId)
        .eq('transaction_type', 'expense')
        .gte('occurred_at', `${earliestStart}T00:00:00.000Z`)
        .lt('occurred_at', `${addDays(latestEnd, 1)}T00:00:00.000Z`)
        .order('occurred_at')
        .order('id')),
    ])
    checkError(accountsResult.error)
    const accountCurrency = new Map(accountsResult.data.map((account) => [account.id, account.currency]))
    return data.map((budget) => {
      const spent = transactions.reduce((total, transaction) => {
        if (
          transaction.category_id === budget.category_id
          && accountCurrency.get(transaction.account_id) === budget.currency
          && new Date(transaction.occurred_at).toISOString().slice(0, 10) >= budget.period_start
          && new Date(transaction.occurred_at).toISOString().slice(0, 10) <= budget.period_end
        ) return total + Number(transaction.amount)
        return total
      }, 0)
      return { ...budget, category_name: categoryNames.get(budget.category_id) || '', spent }
    })
  },

  async getBudgetDetails(userId, budgetId) {
    const ownerId = requireUserId(userId)
    const { data: budget, error } = await supabase.from('budgets')
      .select('id, category_id, amount, currency, period_start, period_end')
      .eq('user_id', ownerId)
      .eq('id', budgetId)
      .single()
    checkError(error)
    const [categoryResult, accountsResult] = await Promise.all([
      supabase.from('categories').select('id, name').eq('user_id', ownerId).eq('id', budget.category_id).single(),
      supabase.from('accounts').select('id, name, currency').eq('user_id', ownerId),
    ])
    checkError(categoryResult.error)
    checkError(accountsResult.error)
    const accountsById = new Map(accountsResult.data.map((account) => [account.id, account]))
    const matchingAccountIds = accountsResult.data
      .filter((account) => account.currency === budget.currency)
      .map((account) => account.id)
    const transactionRows = matchingAccountIds.length
      ? await fetchAllRows(() => supabase.from('transactions')
        .select('id, description, amount, occurred_at, account_id, category_id')
        .eq('user_id', ownerId)
        .eq('category_id', budget.category_id)
        .eq('transaction_type', 'expense')
        .in('account_id', matchingAccountIds)
        .gte('occurred_at', `${budget.period_start}T00:00:00.000Z`)
        .lt('occurred_at', `${addDays(budget.period_end, 1)}T00:00:00.000Z`)
        .order('occurred_at', { ascending: false })
        .order('id'))
      : []
    const transactions = transactionRows.map((transaction) => ({
        ...transaction,
        account_name: accountsById.get(transaction.account_id)?.name || '',
      }))
    return {
      ...budget,
      category_name: categoryResult.data.name,
      transactions,
      spent: transactions.reduce((total, transaction) => total + Number(transaction.amount), 0),
    }
  },

  async updateBudget(userId, budgetId, input) {
    const ownerId = requireUserId(userId)
    const periodStart = requireDate(input.periodStart, 'Budget start')
    const periodEnd = requireDate(input.periodEnd, 'Budget end')
    if (periodEnd < periodStart) {
      throw new Error('Choose a valid budget date range.')
    }
    const { data, error } = await supabase.from('budgets').update({
      category_id: input.categoryId,
      amount: requireAmount(input.amount, 'Budget amount'),
      period_start: periodStart,
      period_end: periodEnd,
    }).eq('user_id', ownerId).eq('id', budgetId).select('id').single()
    checkError(error)
    return data
  },

  async deleteBudget(userId, budgetId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('budgets')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', budgetId)
      .select('id')
      .single()
    checkError(error)
  },

  async createGoal(userId, input) {
    const ownerId = requireUserId(userId)
    const savedAmount = input.savedAmount === '' || input.savedAmount == null
      ? 0
      : Number(input.savedAmount)
    const targetAmount = requireAmount(input.targetAmount, 'Target amount')
    if (!Number.isFinite(savedAmount) || savedAmount < 0 || savedAmount > MAX_AMOUNT) {
      throw new Error('Saved amount must be zero or greater.')
    }
    const { data, error } = await supabase.from('financial_goals').insert({
      user_id: ownerId,
      name: requireText(input.name, 'Goal name', 100),
      description: input.description?.trim() || null,
      currency: requireCurrency(input.currency),
      target_amount: targetAmount,
      saved_amount: Math.round(savedAmount * 100) / 100,
      target_date: input.targetDate ? requireDate(input.targetDate, 'Goal date') : null,
    }).select('id').single()
    checkError(error)
    return data
  },

  async getGoals(userId) {
    const ownerId = requireUserId(userId)
    const { data, error } = await supabase.from('financial_goals')
      .select('id, name, description, target_amount, saved_amount, target_date, currency, created_at')
      .eq('user_id', ownerId)
      .order('created_at', { ascending: false })
    checkError(error)
    return data
  },

  async getGoalDetails(userId, goalId) {
    const ownerId = requireUserId(userId)
    const [goalResult, activity] = await Promise.all([
      supabase.from('financial_goals')
        .select('id, name, description, target_amount, saved_amount, target_date, currency, created_at')
        .eq('user_id', ownerId)
        .eq('id', goalId)
        .single(),
      fetchAllRows(() => supabase.from('savings_transactions')
        .select('id, activity_type, amount, note, created_at')
        .eq('user_id', ownerId)
        .eq('goal_id', goalId)
        .order('created_at', { ascending: false })
        .order('id')),
    ])
    checkError(goalResult.error)
    return { ...goalResult.data, activity }
  },

  async adjustGoalSavings(userId, goalId, direction, amount, note) {
    requireUserId(userId)
    if (!['add', 'withdraw'].includes(direction)) {
      throw new Error('Choose whether to add or withdraw savings.')
    }
    const { data, error } = await supabase.rpc('adjust_goal_savings', {
      p_goal_id: goalId,
      p_direction: direction,
      p_amount: requireAmount(amount, 'Savings amount'),
      p_note: note?.trim() || null,
    })
    checkError(error)
    return data
  },

  async updateGoal(userId, goalId, input) {
    const ownerId = requireUserId(userId)
    const targetAmount = requireAmount(input.targetAmount, 'Target amount')
    const { data, error } = await supabase.from('financial_goals').update({
      name: requireText(input.name, 'Goal name', 100),
      description: input.description?.trim() || null,
      target_amount: targetAmount,
      target_date: input.targetDate ? requireDate(input.targetDate, 'Goal date') : null,
    }).eq('user_id', ownerId).eq('id', goalId).select('id').single()
    checkError(error)
    return data
  },

  async deleteGoal(userId, goalId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('financial_goals')
      .delete()
      .eq('user_id', ownerId)
      .eq('id', goalId)
      .select('id')
      .single()
    checkError(error)
  },

  async markNotificationRead(userId, notificationId) {
    const ownerId = requireUserId(userId)
    const { error } = await supabase.from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', ownerId)
      .eq('id', notificationId)
      .select('id')
      .single()
    checkError(error)
  },
}
