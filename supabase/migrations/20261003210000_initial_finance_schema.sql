begin;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := pg_catalog.now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'MyFinance user' check (pg_catalog.length(pg_catalog.btrim(full_name)) between 1 and 120),
  email text,
  default_currency text not null default 'USD' check (default_currency = 'USD'),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (id, default_currency)
);
comment on column public.profiles.default_currency is
  'Currently restricted to USD because this application has no currency conversion support.';

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 80),
  account_type text not null check (account_type in ('checking', 'savings', 'cash')),
  currency text not null default 'USD',
  opening_balance numeric(15, 2) not null default 0 check (opening_balance >= 0),
  is_archived boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, id),
  unique (user_id, name),
  foreign key (user_id, currency)
    references public.profiles (id, default_currency)
    on update restrict
    on delete cascade
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 60),
  category_type text not null check (category_type in ('income', 'expense')),
  icon text not null default 'circle',
  is_system boolean not null default false,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  unique (user_id, id),
  unique (user_id, name, category_type),
  unique (user_id, id, category_type)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  account_id uuid not null,
  category_id uuid,
  transaction_type text not null check (transaction_type in ('income', 'expense')),
  amount numeric(15, 2) not null check (amount > 0),
  description text not null check (pg_catalog.length(pg_catalog.btrim(description)) between 1 and 160),
  merchant text check (merchant is null or pg_catalog.length(merchant) <= 120),
  occurred_at timestamptz not null default pg_catalog.now(),
  notes text check (notes is null or pg_catalog.length(notes) <= 1000),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  foreign key (user_id, account_id)
    references public.accounts (user_id, id)
    on delete no action deferrable initially deferred,
  foreign key (user_id, category_id, transaction_type)
    references public.categories (user_id, id, category_type)
    on delete no action deferrable initially deferred,
  unique (user_id, request_id)
);

create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  from_account_id uuid not null,
  to_account_id uuid not null,
  amount numeric(15, 2) not null check (amount > 0),
  description text check (description is null or pg_catalog.length(description) <= 160),
  occurred_at timestamptz not null default pg_catalog.now(),
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (from_account_id <> to_account_id),
  foreign key (user_id, from_account_id)
    references public.accounts (user_id, id)
    on delete no action deferrable initially deferred,
  foreign key (user_id, to_account_id)
    references public.accounts (user_id, id)
    on delete no action deferrable initially deferred,
  unique (user_id, request_id)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null,
  category_type text not null default 'expense' check (category_type = 'expense'),
  amount numeric(15, 2) not null check (amount > 0),
  period_start date not null,
  period_end date not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),
  check (period_end >= period_start),
  unique (user_id, category_id, period_start, period_end),
  foreign key (user_id, category_id, category_type)
    references public.categories (user_id, id, category_type)
    on delete no action deferrable initially deferred
);

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (pg_catalog.length(pg_catalog.btrim(name)) between 1 and 100),
  target_amount numeric(15, 2) not null check (target_amount > 0),
  saved_amount numeric(15, 2) not null default 0 check (saved_amount >= 0 and saved_amount <= target_amount),
  target_date date,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  title text not null check (pg_catalog.length(pg_catalog.btrim(title)) between 1 and 120),
  body text not null check (pg_catalog.length(pg_catalog.btrim(body)) between 1 and 500),
  read_at timestamptz,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now()
);

create index if not exists accounts_user_created_idx
  on public.accounts (user_id, created_at desc);
create index if not exists accounts_user_type_idx
  on public.accounts (user_id, account_type) where is_archived = false;
create index if not exists categories_user_type_idx
  on public.categories (user_id, category_type, name);
create index if not exists transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);
create index if not exists transactions_user_type_occurred_idx
  on public.transactions (user_id, transaction_type, occurred_at desc);
create index if not exists transactions_user_account_occurred_idx
  on public.transactions (user_id, account_id, occurred_at desc);
create index if not exists transactions_user_category_occurred_idx
  on public.transactions (user_id, category_id, occurred_at desc);
create index if not exists transfers_user_occurred_idx
  on public.transfers (user_id, occurred_at desc);
create index if not exists transfers_user_from_idx
  on public.transfers (user_id, from_account_id, occurred_at desc);
create index if not exists transfers_user_to_idx
  on public.transfers (user_id, to_account_id, occurred_at desc);
create index if not exists budgets_user_period_idx
  on public.budgets (user_id, period_start, period_end);
create index if not exists goals_user_created_idx
  on public.financial_goals (user_id, created_at desc);
create index if not exists notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function public.set_updated_at();
drop trigger if exists accounts_set_updated_at on public.accounts;
create trigger accounts_set_updated_at before update on public.accounts
for each row execute function public.set_updated_at();
drop trigger if exists categories_set_updated_at on public.categories;
create trigger categories_set_updated_at before update on public.categories
for each row execute function public.set_updated_at();
drop trigger if exists transactions_set_updated_at on public.transactions;
create trigger transactions_set_updated_at before update on public.transactions
for each row execute function public.set_updated_at();
drop trigger if exists transfers_set_updated_at on public.transfers;
create trigger transfers_set_updated_at before update on public.transfers
for each row execute function public.set_updated_at();
drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at before update on public.budgets
for each row execute function public.set_updated_at();
drop trigger if exists financial_goals_set_updated_at on public.financial_goals;
create trigger financial_goals_set_updated_at before update on public.financial_goals
for each row execute function public.set_updated_at();
drop trigger if exists notifications_set_updated_at on public.notifications;
create trigger notifications_set_updated_at before update on public.notifications
for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  v_full_name := nullif(
    pg_catalog.btrim(new.raw_user_meta_data ->> 'full_name'),
    ''
  );

  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(v_full_name, 'MyFinance user'))
  on conflict (id) do nothing;

  insert into public.categories (user_id, name, category_type, icon, is_system)
  values
    (new.id, 'Salary', 'income', 'briefcase', true),
    (new.id, 'Other income', 'income', 'plus-circle', true),
    (new.id, 'Housing', 'expense', 'home', true),
    (new.id, 'Groceries', 'expense', 'basket', true),
    (new.id, 'Food & Drink', 'expense', 'coffee', true),
    (new.id, 'Transport', 'expense', 'car', true),
    (new.id, 'Entertainment', 'expense', 'play', true),
    (new.id, 'Other expense', 'expense', 'circle', true)
  on conflict (user_id, name, category_type) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_myfinance on auth.users;
create trigger on_auth_user_created_myfinance
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, email, full_name)
select
  users.id,
  users.email,
  coalesce(
    nullif(pg_catalog.btrim(users.raw_user_meta_data ->> 'full_name'), ''),
    'MyFinance user'
  )
from auth.users as users
on conflict (id) do nothing;

insert into public.categories (user_id, name, category_type, icon, is_system)
select
  profiles.id,
  defaults.name,
  defaults.category_type,
  defaults.icon,
  true
from public.profiles as profiles
cross join (
  values
    ('Salary', 'income', 'briefcase'),
    ('Other income', 'income', 'plus-circle'),
    ('Housing', 'expense', 'home'),
    ('Groceries', 'expense', 'basket'),
    ('Food & Drink', 'expense', 'coffee'),
    ('Transport', 'expense', 'car'),
    ('Entertainment', 'expense', 'play'),
    ('Other expense', 'expense', 'circle')
) as defaults(name, category_type, icon)
on conflict (user_id, name, category_type) do nothing;

alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transfers enable row level security;
alter table public.budgets enable row level security;
alter table public.financial_goals enable row level security;
alter table public.notifications enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
for select to authenticated using (id = (select auth.uid()));
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

drop policy if exists accounts_select_own on public.accounts;
create policy accounts_select_own on public.accounts
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists accounts_insert_own on public.accounts;
create policy accounts_insert_own on public.accounts
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists accounts_update_own on public.accounts;
create policy accounts_update_own on public.accounts
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists accounts_delete_own on public.accounts;
create policy accounts_delete_own on public.accounts
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists categories_select_own on public.categories;
create policy categories_select_own on public.categories
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists transactions_select_own on public.transactions;
create policy transactions_select_own on public.transactions
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists transactions_insert_own on public.transactions;
create policy transactions_insert_own on public.transactions
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists transactions_update_own on public.transactions;
create policy transactions_update_own on public.transactions
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists transactions_delete_own on public.transactions;
create policy transactions_delete_own on public.transactions
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists transfers_select_own on public.transfers;
create policy transfers_select_own on public.transfers
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists transfers_update_own on public.transfers;
create policy transfers_update_own on public.transfers
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists transfers_delete_own on public.transfers;
create policy transfers_delete_own on public.transfers
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists financial_goals_select_own on public.financial_goals;
create policy financial_goals_select_own on public.financial_goals
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists financial_goals_insert_own on public.financial_goals;
create policy financial_goals_insert_own on public.financial_goals
for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists financial_goals_update_own on public.financial_goals;
create policy financial_goals_update_own on public.financial_goals
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists financial_goals_delete_own on public.financial_goals;
create policy financial_goals_delete_own on public.financial_goals
for delete to authenticated using (user_id = (select auth.uid()));

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own on public.notifications
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own on public.notifications
for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));
drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own on public.notifications
for delete to authenticated using (user_id = (select auth.uid()));

grant select on public.profiles to authenticated;
grant update (full_name) on public.profiles to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, update, delete on public.transfers to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.financial_goals to authenticated;
grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke all on public.profiles, public.accounts, public.categories, public.transactions,
  public.transfers, public.budgets, public.financial_goals, public.notifications
  from anon;

create or replace function public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric,
  p_description text default null,
  p_occurred_at timestamptz default pg_catalog.now(),
  p_request_id uuid default gen_random_uuid()
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_from_currency text;
  v_to_currency text;
  v_transfer_id uuid;
  v_existing public.transfers%rowtype;
  v_request_id uuid := coalesce(p_request_id, gen_random_uuid());
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  if p_from_account_id is null or p_to_account_id is null
     or p_from_account_id = p_to_account_id then
    raise exception 'Choose two different accounts.' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 or p_amount > 9999999999999.99 then
    raise exception 'Transfer amount must be greater than zero and within the supported range.'
      using errcode = '22023';
  end if;

  select account.currency
  into v_from_currency
  from public.accounts as account
  where account.id = p_from_account_id
    and account.user_id = v_user_id
    and account.is_archived = false;

  select account.currency
  into v_to_currency
  from public.accounts as account
  where account.id = p_to_account_id
    and account.user_id = v_user_id
    and account.is_archived = false;

  if v_from_currency is null or v_to_currency is null then
    raise exception 'One or both accounts are unavailable.' using errcode = '22023';
  end if;

  if v_from_currency <> v_to_currency then
    raise exception 'Transfers between accounts with different currencies are not supported.'
      using errcode = '22023';
  end if;

  insert into public.transfers (
    user_id, request_id, from_account_id, to_account_id, amount, description, occurred_at
  )
  values (
    v_user_id,
    v_request_id,
    p_from_account_id,
    p_to_account_id,
    p_amount,
    nullif(pg_catalog.btrim(p_description), ''),
    coalesce(p_occurred_at, pg_catalog.now())
  )
  on conflict (user_id, request_id) do nothing
  returning id into v_transfer_id;

  if v_transfer_id is null then
    select transfer.*
    into v_existing
    from public.transfers as transfer
    where transfer.user_id = v_user_id
      and transfer.request_id = v_request_id;

    if v_existing.from_account_id <> p_from_account_id
       or v_existing.to_account_id <> p_to_account_id
       or v_existing.amount <> p_amount
       or v_existing.description is distinct from nullif(pg_catalog.btrim(p_description), '')
       or v_existing.occurred_at is distinct from coalesce(p_occurred_at, pg_catalog.now()) then
      raise exception 'This transfer request identifier was already used with different data.'
        using errcode = '23505';
    end if;

    v_transfer_id := v_existing.id;
  end if;

  return v_transfer_id;
end;
$$;

revoke all on function public.create_transfer(uuid, uuid, numeric, text, timestamptz, uuid) from public, anon;
grant execute on function public.create_transfer(uuid, uuid, numeric, text, timestamptz, uuid) to authenticated;

create or replace function public.get_dashboard_data()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_now timestamptz := pg_catalog.now();
  v_today date;
  v_month_start timestamptz;
  v_six_months_start timestamptz;
  v_result jsonb;
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;

  v_month_start := pg_catalog.date_trunc('month', v_now at time zone 'UTC') at time zone 'UTC';
  v_six_months_start := v_month_start - interval '5 months';
  v_today := (v_now at time zone 'UTC')::date;

  select pg_catalog.jsonb_build_object(
    'currency', coalesce(
      (select profile.default_currency from public.profiles as profile where profile.id = v_user_id),
      'USD'
    ),
    'accounts', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', account.id,
          'name', account.name,
          'account_type', account.account_type,
          'currency', account.currency,
          'opening_balance', account.opening_balance,
          'balance',
            account.opening_balance
            + coalesce((
              select pg_catalog.sum(
                case when transaction_row.transaction_type = 'income'
                  then transaction_row.amount else -transaction_row.amount end
              )
              from public.transactions as transaction_row
              where transaction_row.user_id = v_user_id
                and transaction_row.account_id = account.id
            ), 0)
            + coalesce((
              select pg_catalog.sum(transfer.amount)
              from public.transfers as transfer
              where transfer.user_id = v_user_id
                and transfer.to_account_id = account.id
            ), 0)
            - coalesce((
              select pg_catalog.sum(transfer.amount)
              from public.transfers as transfer
              where transfer.user_id = v_user_id
                and transfer.from_account_id = account.id
            ), 0),
          'is_archived', account.is_archived
        )
        order by account.created_at
      )
      from public.accounts as account
      where account.user_id = v_user_id
    ), '[]'::jsonb),
    'balance', coalesce((
      select pg_catalog.sum(
        account.opening_balance
        + coalesce((
          select pg_catalog.sum(
            case when transaction_row.transaction_type = 'income'
              then transaction_row.amount else -transaction_row.amount end
          )
          from public.transactions as transaction_row
          where transaction_row.user_id = v_user_id
            and transaction_row.account_id = account.id
        ), 0)
        + coalesce((
          select pg_catalog.sum(transfer.amount)
          from public.transfers as transfer
          where transfer.user_id = v_user_id and transfer.to_account_id = account.id
        ), 0)
        - coalesce((
          select pg_catalog.sum(transfer.amount)
          from public.transfers as transfer
          where transfer.user_id = v_user_id and transfer.from_account_id = account.id
        ), 0)
      )
      from public.accounts as account
      where account.user_id = v_user_id and account.is_archived = false
    ), 0),
    'savings', coalesce((
      select pg_catalog.sum(
        account.opening_balance
        + coalesce((
          select pg_catalog.sum(
            case when transaction_row.transaction_type = 'income'
              then transaction_row.amount else -transaction_row.amount end
          )
          from public.transactions as transaction_row
          where transaction_row.user_id = v_user_id
            and transaction_row.account_id = account.id
        ), 0)
        + coalesce((
          select pg_catalog.sum(transfer.amount)
          from public.transfers as transfer
          where transfer.user_id = v_user_id and transfer.to_account_id = account.id
        ), 0)
        - coalesce((
          select pg_catalog.sum(transfer.amount)
          from public.transfers as transfer
          where transfer.user_id = v_user_id and transfer.from_account_id = account.id
        ), 0)
      )
      from public.accounts as account
      where account.user_id = v_user_id
        and account.is_archived = false
        and account.account_type = 'savings'
    ), 0),
    'income', coalesce((
      select pg_catalog.sum(transaction_row.amount)
      from public.transactions as transaction_row
      where transaction_row.user_id = v_user_id
        and transaction_row.transaction_type = 'income'
        and transaction_row.occurred_at >= v_month_start
        and transaction_row.occurred_at < v_month_start + interval '1 month'
    ), 0),
    'expenses', coalesce((
      select pg_catalog.sum(transaction_row.amount)
      from public.transactions as transaction_row
      where transaction_row.user_id = v_user_id
        and transaction_row.transaction_type = 'expense'
        and transaction_row.occurred_at >= v_month_start
        and transaction_row.occurred_at < v_month_start + interval '1 month'
    ), 0),
    'cashflow', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'month', to_char(months.month_start at time zone 'UTC', 'YYYY-MM'),
          'income', coalesce((
            select pg_catalog.sum(transaction_row.amount)
            from public.transactions as transaction_row
            where transaction_row.user_id = v_user_id
              and transaction_row.transaction_type = 'income'
              and transaction_row.occurred_at >= months.month_start
              and transaction_row.occurred_at < months.month_start + interval '1 month'
          ), 0),
          'expenses', coalesce((
            select pg_catalog.sum(transaction_row.amount)
            from public.transactions as transaction_row
            where transaction_row.user_id = v_user_id
              and transaction_row.transaction_type = 'expense'
              and transaction_row.occurred_at >= months.month_start
              and transaction_row.occurred_at < months.month_start + interval '1 month'
          ), 0)
        )
        order by months.month_start
      )
      from (
        select generate_series(
          v_six_months_start,
          v_month_start,
          interval '1 month'
        ) as month_start
      ) as months
    ), '[]'::jsonb),
    'category_spending', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'category_id', category.id,
          'name', category.name,
          'amount', category_totals.amount
        )
        order by category_totals.amount desc
      )
      from (
        select transaction_row.category_id, pg_catalog.sum(transaction_row.amount) as amount
        from public.transactions as transaction_row
        where transaction_row.user_id = v_user_id
          and transaction_row.transaction_type = 'expense'
          and transaction_row.occurred_at >= v_month_start
          and transaction_row.occurred_at < v_month_start + interval '1 month'
        group by transaction_row.category_id
      ) as category_totals
      left join public.categories as category
        on category.id = category_totals.category_id
       and category.user_id = v_user_id
    ), '[]'::jsonb),
    'transactions', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', transaction_row.id,
          'description', transaction_row.description,
          'merchant', transaction_row.merchant,
          'notes', transaction_row.notes,
          'transaction_type', transaction_row.transaction_type,
          'amount', transaction_row.amount,
          'occurred_at', transaction_row.occurred_at,
          'category_id', transaction_row.category_id,
          'category_name', category.name,
          'category_icon', category.icon,
          'account_id', transaction_row.account_id,
          'account_name', account.name,
          'to_account_id', transaction_row.to_account_id,
          'to_account_name', destination_account.name
        )
        order by transaction_row.occurred_at desc
      )
      from (
        select
          transaction_row.id,
          transaction_row.description,
          transaction_row.merchant,
          transaction_row.notes,
          transaction_row.transaction_type,
          transaction_row.amount,
          transaction_row.occurred_at,
          transaction_row.category_id,
          transaction_row.account_id,
          null::uuid as to_account_id
        from public.transactions as transaction_row
        where transaction_row.user_id = v_user_id
        union all
        select
          transfer.id,
          coalesce(transfer.description, 'Transfer'),
          null::text,
          null::text,
          'transfer'::text,
          transfer.amount,
          transfer.occurred_at,
          null::uuid,
          transfer.from_account_id,
          transfer.to_account_id
        from public.transfers as transfer
        where transfer.user_id = v_user_id
        order by occurred_at desc
        limit 50
      ) as transaction_row
      join public.accounts as account
        on account.id = transaction_row.account_id
       and account.user_id = v_user_id
      left join public.accounts as destination_account
        on destination_account.id = transaction_row.to_account_id
       and destination_account.user_id = v_user_id
      left join public.categories as category
        on category.id = transaction_row.category_id
       and category.user_id = v_user_id
    ), '[]'::jsonb),
    'budgets', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', budget.id,
          'category_id', budget.category_id,
          'category_name', category.name,
          'amount', budget.amount,
          'spent', coalesce((
            select pg_catalog.sum(transaction_row.amount)
            from public.transactions as transaction_row
            where transaction_row.user_id = v_user_id
              and transaction_row.category_id = budget.category_id
              and transaction_row.transaction_type = 'expense'
              and transaction_row.occurred_at >= budget.period_start::timestamp at time zone 'UTC'
              and transaction_row.occurred_at < (budget.period_end + 1)::timestamp at time zone 'UTC'
          ), 0),
          'period_start', budget.period_start,
          'period_end', budget.period_end
        )
        order by budget.period_start
      )
      from public.budgets as budget
      join public.categories as category
        on category.id = budget.category_id
       and category.user_id = v_user_id
      where budget.user_id = v_user_id
        and budget.period_start <= v_today
        and budget.period_end >= v_today
    ), '[]'::jsonb),
    'goals', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', goal.id,
          'name', goal.name,
          'target_amount', goal.target_amount,
          'saved_amount', goal.saved_amount,
          'target_date', goal.target_date
        )
        order by goal.created_at desc
      )
      from public.financial_goals as goal
      where goal.user_id = v_user_id
    ), '[]'::jsonb),
    'notifications', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', notification.id,
          'title', notification.title,
          'body', notification.body,
          'read_at', notification.read_at,
          'created_at', notification.created_at
        )
        order by notification.created_at desc
      )
      from (
        select *
        from public.notifications
        where user_id = v_user_id
        order by created_at desc
        limit 10
      ) as notification
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$$;

revoke all on function public.get_dashboard_data() from public, anon;
grant execute on function public.get_dashboard_data() to authenticated;

commit;
