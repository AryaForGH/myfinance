begin;

alter table public.financial_goals
  add column if not exists description text;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'financial_goals_saved_amount_check'
      and conrelid = 'public.financial_goals'::regclass
  ) then
    alter table public.financial_goals
      drop constraint financial_goals_saved_amount_check;
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'financial_goals_saved_amount_nonnegative_check'
      and conrelid = 'public.financial_goals'::regclass
  ) then
    alter table public.financial_goals
      add constraint financial_goals_saved_amount_nonnegative_check
      check (saved_amount >= 0);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'financial_goals_description_length_check'
      and conrelid = 'public.financial_goals'::regclass
  ) then
    alter table public.financial_goals
      add constraint financial_goals_description_length_check
      check (description is null or pg_catalog.length(description) <= 1000);
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conname = 'financial_goals_user_id_id_key'
      and conrelid = 'public.financial_goals'::regclass
  ) then
    alter table public.financial_goals
      add constraint financial_goals_user_id_id_key unique (user_id, id);
  end if;
end;
$$;

create table if not exists public.savings_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  goal_id uuid not null,
  activity_type text not null check (activity_type in ('add', 'withdraw')),
  amount numeric(15, 2) not null check (amount > 0),
  note text check (note is null or pg_catalog.length(note) <= 500),
  created_at timestamptz not null default pg_catalog.now(),
  foreign key (user_id, goal_id)
    references public.financial_goals (user_id, id)
    on delete cascade
);

create index if not exists savings_transactions_user_goal_created_idx
  on public.savings_transactions (user_id, goal_id, created_at desc);

alter table public.savings_transactions enable row level security;

drop policy if exists savings_transactions_select_own on public.savings_transactions;
create policy savings_transactions_select_own on public.savings_transactions
  for select to authenticated
  using (user_id = (select auth.uid()));

revoke all on public.savings_transactions from public, anon, authenticated;
grant select on public.savings_transactions to authenticated;
revoke update (saved_amount) on public.financial_goals from authenticated;
grant update (name, description, target_amount, target_date)
  on public.financial_goals to authenticated;

insert into public.savings_transactions (user_id, goal_id, activity_type, amount, note, created_at)
select goal.user_id, goal.id, 'add', goal.saved_amount, 'Opening balance', goal.created_at
from public.financial_goals as goal
where goal.saved_amount > 0
  and not exists (
    select 1
    from public.savings_transactions as activity
    where activity.user_id = goal.user_id and activity.goal_id = goal.id
  );

create or replace function public.record_initial_goal_savings()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.saved_amount > 0 then
    insert into public.savings_transactions (user_id, goal_id, activity_type, amount, note)
    values (new.user_id, new.id, 'add', new.saved_amount, 'Initial savings');
  end if;
  return new;
end;
$$;

revoke all on function public.record_initial_goal_savings() from public, anon, authenticated;

drop trigger if exists financial_goals_record_initial_savings on public.financial_goals;
create trigger financial_goals_record_initial_savings
  after insert on public.financial_goals
  for each row execute function public.record_initial_goal_savings();

create or replace function public.adjust_goal_savings(
  p_goal_id uuid,
  p_direction text,
  p_amount numeric,
  p_note text default null
)
returns numeric
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_saved_amount numeric(15, 2);
  v_next_amount numeric(15, 2);
begin
  if v_user_id is null then
    raise exception 'Authentication is required.' using errcode = '42501';
  end if;
  if p_direction is null or p_direction not in ('add', 'withdraw') then
    raise exception 'Choose add or withdraw.' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 or p_amount > 9999999999999.99 then
    raise exception 'Savings amount must be greater than zero.' using errcode = '22023';
  end if;
  if p_note is not null and pg_catalog.length(p_note) > 500 then
    raise exception 'Note must be 500 characters or fewer.' using errcode = '22023';
  end if;

  select goal.saved_amount
    into v_saved_amount
    from public.financial_goals as goal
    where goal.id = p_goal_id and goal.user_id = v_user_id
    for update;

  if not found then
    raise exception 'Target was not found.' using errcode = 'P0002';
  end if;

  v_next_amount := case
    when p_direction = 'add' then v_saved_amount + p_amount
    else v_saved_amount - p_amount
  end;

  if v_next_amount < 0 then
    raise exception 'Savings cannot be less than zero.' using errcode = '22023';
  end if;
  update public.financial_goals
    set saved_amount = v_next_amount
    where id = p_goal_id and user_id = v_user_id;

  insert into public.savings_transactions (user_id, goal_id, activity_type, amount, note)
    values (v_user_id, p_goal_id, p_direction, p_amount, nullif(pg_catalog.btrim(p_note), ''));

  return v_next_amount;
end;
$$;

revoke all on function public.adjust_goal_savings(uuid, text, numeric, text) from public, anon;
grant execute on function public.adjust_goal_savings(uuid, text, numeric, text) to authenticated;

notify pgrst, 'reload schema';

commit;
