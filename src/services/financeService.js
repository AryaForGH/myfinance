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

function requireUserId(userId) {
  if (!userId) throw new Error('Sign in to access your financial data.')
  return userId
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
    if (!Number.isFinite(savedAmount) || savedAmount < 0 || savedAmount > targetAmount) {
      throw new Error('Saved amount must be between zero and the target amount.')
    }
    const { data, error } = await supabase.from('financial_goals').insert({
      user_id: ownerId,
      name: requireText(input.name, 'Goal name', 100),
      currency: requireCurrency(input.currency),
      target_amount: targetAmount,
      saved_amount: Math.round(savedAmount * 100) / 100,
      target_date: input.targetDate ? requireDate(input.targetDate, 'Goal date') : null,
    }).select('id').single()
    checkError(error)
    return data
  },

  async updateGoal(userId, goalId, input) {
    const ownerId = requireUserId(userId)
    const targetAmount = requireAmount(input.targetAmount, 'Target amount')
    const savedAmount = Number(input.savedAmount)
    if (!Number.isFinite(savedAmount) || savedAmount < 0 || savedAmount > targetAmount) {
      throw new Error('Saved amount must be between zero and the target amount.')
    }
    const { data, error } = await supabase.from('financial_goals').update({
      name: requireText(input.name, 'Goal name', 100),
      target_amount: targetAmount,
      saved_amount: Math.round(savedAmount * 100) / 100,
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
