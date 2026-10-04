begin;

alter table public.profiles
  add column if not exists language text not null default 'id',
  add column if not exists currency text not null default 'IDR';

alter table public.accounts
  add column if not exists currency text not null default 'USD';

alter table public.budgets
  add column if not exists currency text not null default 'USD';

alter table public.financial_goals
  add column if not exists currency text not null default 'USD';

comment on column public.profiles.default_currency is
  'Legacy schema currency retained for compatibility; use currency for the user display preference.';
comment on column public.profiles.currency is
  'Preferred reporting and new-record currency; changing it never converts existing financial amounts.';
comment on column public.accounts.currency is
  'Immutable denomination for the opening balance and all transactions associated with this account.';
comment on column public.budgets.currency is
  'Immutable denomination of this budget limit.';
comment on column public.financial_goals.currency is
  'Immutable denomination of this financial goal.';

alter table public.accounts
  drop constraint if exists accounts_user_id_currency_fkey;

create index if not exists accounts_user_currency_idx
  on public.accounts (user_id, currency, is_archived);
create index if not exists budgets_user_currency_period_idx
  on public.budgets (user_id, currency, period_start, period_end);
create index if not exists goals_user_currency_created_idx
  on public.financial_goals (user_id, currency, created_at desc);

do $$
begin
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'profiles_language_supported_check') then
    alter table public.profiles add constraint profiles_language_supported_check
      check (language in ('id', 'en', 'ms', 'ja', 'zh'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'profiles_currency_supported_check') then
    alter table public.profiles add constraint profiles_currency_supported_check
      check (currency in ('IDR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'MYR', 'SGD', 'AUD', 'CAD', 'CHF', 'SAR', 'KRW', 'THB', 'INR'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'accounts_currency_supported_check') then
    alter table public.accounts add constraint accounts_currency_supported_check
      check (currency in ('IDR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'MYR', 'SGD', 'AUD', 'CAD', 'CHF', 'SAR', 'KRW', 'THB', 'INR'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'budgets_currency_supported_check') then
    alter table public.budgets add constraint budgets_currency_supported_check
      check (currency in ('IDR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'MYR', 'SGD', 'AUD', 'CAD', 'CHF', 'SAR', 'KRW', 'THB', 'INR'));
  end if;
  if not exists (select 1 from pg_catalog.pg_constraint where conname = 'financial_goals_currency_supported_check') then
    alter table public.financial_goals add constraint financial_goals_currency_supported_check
      check (currency in ('IDR', 'USD', 'EUR', 'GBP', 'JPY', 'CNY', 'MYR', 'SGD', 'AUD', 'CAD', 'CHF', 'SAR', 'KRW', 'THB', 'INR'));
  end if;
end;
$$;

create or replace function public.prevent_record_currency_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.currency is distinct from old.currency then
    raise exception 'Record currency is immutable; create a new record in the desired currency.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_record_currency_change() from public, anon, authenticated;

create or replace function public.prevent_transaction_currency_change()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_old_currency text;
  v_new_currency text;
begin
  select account.currency into v_old_currency
  from public.accounts as account
  where account.user_id = old.user_id and account.id = old.account_id;
  select account.currency into v_new_currency
  from public.accounts as account
  where account.user_id = new.user_id and account.id = new.account_id;

  if v_old_currency is distinct from v_new_currency then
    raise exception 'Transaction currency cannot change when its account is changed.'
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.prevent_transaction_currency_change() from public, anon, authenticated;

drop trigger if exists transactions_currency_immutable on public.transactions;
create trigger transactions_currency_immutable
before update of account_id on public.transactions
for each row execute function public.prevent_transaction_currency_change();

drop trigger if exists accounts_currency_immutable on public.accounts;
create trigger accounts_currency_immutable
before update of currency on public.accounts
for each row execute function public.prevent_record_currency_change();

drop trigger if exists budgets_currency_immutable on public.budgets;
create trigger budgets_currency_immutable
before update of currency on public.budgets
for each row execute function public.prevent_record_currency_change();

drop trigger if exists financial_goals_currency_immutable on public.financial_goals;
create trigger financial_goals_currency_immutable
before update of currency on public.financial_goals
for each row execute function public.prevent_record_currency_change();

revoke update on public.accounts, public.budgets, public.financial_goals from authenticated;
revoke update on public.transfers from authenticated;
grant update (name, account_type, is_archived) on public.accounts to authenticated;
grant update (category_id, amount, period_start, period_end) on public.budgets to authenticated;
grant update (name, target_amount, saved_amount, target_date) on public.financial_goals to authenticated;

grant update (full_name, language, currency) on public.profiles to authenticated;

create or replace function public.get_dashboard_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_currency text;
  v_now timestamptz := pg_catalog.now();
  v_month_start timestamptz;
  v_six_months_start timestamptz;
  v_today date;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  select profile.currency into v_currency
  from public.profiles as profile
  where profile.id = v_user_id;
  v_currency := coalesce(v_currency, 'IDR');
  v_month_start := pg_catalog.date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_six_months_start := v_month_start - interval '5 months';
  v_today := (v_now at time zone 'UTC')::date;

  select pg_catalog.jsonb_build_object(
    'currency', v_currency,
    'accounts', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', account.id, 'name', account.name, 'account_type', account.account_type,
        'currency', account.currency, 'opening_balance', account.opening_balance,
        'balance', account.opening_balance
          + coalesce((select pg_catalog.sum(case when tx.transaction_type = 'income' then tx.amount else -tx.amount end)
            from public.transactions as tx where tx.user_id = v_user_id and tx.account_id = account.id), 0)
          + coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
            where tr.user_id = v_user_id and tr.to_account_id = account.id), 0)
          - coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
            where tr.user_id = v_user_id and tr.from_account_id = account.id), 0),
        'is_archived', account.is_archived
      ) order by account.created_at)
      from public.accounts as account where account.user_id = v_user_id
    ), '[]'::jsonb),
    'balance', coalesce((
      select pg_catalog.sum(account.opening_balance
        + coalesce((select pg_catalog.sum(case when tx.transaction_type = 'income' then tx.amount else -tx.amount end)
          from public.transactions as tx where tx.user_id = v_user_id and tx.account_id = account.id), 0)
        + coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
          where tr.user_id = v_user_id and tr.to_account_id = account.id), 0)
        - coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
          where tr.user_id = v_user_id and tr.from_account_id = account.id), 0))
      from public.accounts as account
      where account.user_id = v_user_id and account.is_archived = false and account.currency = v_currency
    ), 0),
    'savings', coalesce((
      select pg_catalog.sum(account.opening_balance
        + coalesce((select pg_catalog.sum(case when tx.transaction_type = 'income' then tx.amount else -tx.amount end)
          from public.transactions as tx where tx.user_id = v_user_id and tx.account_id = account.id), 0)
        + coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
          where tr.user_id = v_user_id and tr.to_account_id = account.id), 0)
        - coalesce((select pg_catalog.sum(tr.amount) from public.transfers as tr
          where tr.user_id = v_user_id and tr.from_account_id = account.id), 0))
      from public.accounts as account
      where account.user_id = v_user_id and account.is_archived = false
        and account.account_type = 'savings' and account.currency = v_currency
    ), 0),
    'income', coalesce((
      select pg_catalog.sum(tx.amount) from public.transactions as tx
      join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
      where tx.user_id = v_user_id and tx.transaction_type = 'income'
        and account.currency = v_currency and tx.occurred_at >= v_month_start
        and tx.occurred_at < v_month_start + interval '1 month'
    ), 0),
    'expenses', coalesce((
      select pg_catalog.sum(tx.amount) from public.transactions as tx
      join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
      where tx.user_id = v_user_id and tx.transaction_type = 'expense'
        and account.currency = v_currency and tx.occurred_at >= v_month_start
        and tx.occurred_at < v_month_start + interval '1 month'
    ), 0),
    'cashflow', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'month', to_char(months.month_start at time zone 'UTC', 'YYYY-MM'),
        'income', coalesce((select pg_catalog.sum(tx.amount) from public.transactions as tx
          join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
          where tx.user_id = v_user_id and tx.transaction_type = 'income' and account.currency = v_currency
            and tx.occurred_at >= months.month_start and tx.occurred_at < months.month_start + interval '1 month'), 0),
        'expenses', coalesce((select pg_catalog.sum(tx.amount) from public.transactions as tx
          join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
          where tx.user_id = v_user_id and tx.transaction_type = 'expense' and account.currency = v_currency
            and tx.occurred_at >= months.month_start and tx.occurred_at < months.month_start + interval '1 month'), 0)
      ) order by months.month_start)
      from (select generate_series(v_six_months_start, v_month_start, interval '1 month') as month_start) as months
    ), '[]'::jsonb),
    'category_spending', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'category_id', totals.category_id, 'name', category.name, 'amount', totals.amount
      ) order by totals.amount desc)
      from (
        select tx.category_id, pg_catalog.sum(tx.amount) as amount
        from public.transactions as tx
        join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
        where tx.user_id = v_user_id and tx.transaction_type = 'expense' and account.currency = v_currency
          and tx.occurred_at >= v_month_start and tx.occurred_at < v_month_start + interval '1 month'
        group by tx.category_id
      ) as totals
      left join public.categories as category on category.id = totals.category_id and category.user_id = v_user_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', entry.id, 'description', entry.description, 'merchant', entry.merchant, 'notes', entry.notes,
        'transaction_type', entry.transaction_type, 'amount', entry.amount, 'occurred_at', entry.occurred_at,
        'category_id', entry.category_id, 'category_name', category.name, 'category_icon', category.icon,
        'account_id', entry.account_id, 'account_name', account.name, 'account_currency', account.currency,
        'to_account_id', entry.to_account_id, 'to_account_name', destination.name,
        'to_account_currency', destination.currency
      ) order by entry.occurred_at desc)
      from (
        select tx.id, tx.description, tx.merchant, tx.notes, tx.transaction_type, tx.amount, tx.occurred_at,
          tx.category_id, tx.account_id, null::uuid as to_account_id
        from public.transactions as tx where tx.user_id = v_user_id
        union all
        select tr.id, coalesce(tr.description, 'Transfer'), null::text, null::text, 'transfer'::text,
          tr.amount, tr.occurred_at, null::uuid, tr.from_account_id, tr.to_account_id
        from public.transfers as tr where tr.user_id = v_user_id
        order by occurred_at desc limit 50
      ) as entry
      join public.accounts as account on account.id = entry.account_id and account.user_id = v_user_id
      left join public.accounts as destination on destination.id = entry.to_account_id and destination.user_id = v_user_id
      left join public.categories as category on category.id = entry.category_id and category.user_id = v_user_id
    ), '[]'::jsonb),
    'budgets', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', budget.id, 'category_id', budget.category_id, 'category_name', category.name,
        'amount', budget.amount, 'currency', budget.currency,
        'spent', coalesce((select pg_catalog.sum(tx.amount) from public.transactions as tx
          join public.accounts as account on account.id = tx.account_id and account.user_id = tx.user_id
          where tx.user_id = v_user_id and tx.category_id = budget.category_id
            and tx.transaction_type = 'expense' and account.currency = budget.currency
            and tx.occurred_at >= budget.period_start::timestamp at time zone 'UTC'
            and tx.occurred_at < (budget.period_end + 1)::timestamp at time zone 'UTC'), 0),
        'period_start', budget.period_start, 'period_end', budget.period_end
      ) order by budget.period_start)
      from public.budgets as budget
      join public.categories as category on category.id = budget.category_id and category.user_id = v_user_id
      where budget.user_id = v_user_id
        and budget.period_start <= v_today and budget.period_end >= v_today
    ), '[]'::jsonb),
    'goals', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', goal.id, 'name', goal.name, 'target_amount', goal.target_amount,
        'saved_amount', goal.saved_amount, 'target_date', goal.target_date, 'currency', goal.currency
      ) order by goal.created_at desc)
      from public.financial_goals as goal
      where goal.user_id = v_user_id
    ), '[]'::jsonb),
    'categories', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', category.id, 'name', category.name, 'category_type', category.category_type, 'icon', category.icon
      ) order by category.category_type, category.name)
      from public.categories as category where category.user_id = v_user_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
        'id', notice.id, 'title', notice.title, 'body', notice.body, 'read_at', notice.read_at, 'created_at', notice.created_at
      ) order by notice.created_at desc)
      from (select * from public.notifications where user_id = v_user_id order by created_at desc limit 10) as notice
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_data() from public, anon;
grant execute on function public.get_dashboard_data() to authenticated;

notify pgrst, 'reload schema';

commit;
