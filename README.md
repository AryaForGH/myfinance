# MyFinance

MyFinance is a React/Vite personal-finance dashboard backed by Supabase Auth and PostgreSQL. The dashboard shows account balances, current-month income and expenses, six-month cash flow, category spending, transactions, transfers, budgets, goals, and notifications.

## Local setup

Use the existing project and install its dependencies with `npm install`. Create a root-level `.env.local` containing the Supabase project URL and publishable key:

```dotenv
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_<key>
```

Do not use a Supabase secret or service-role key in the browser. `.env.local` is ignored by Git. Restart Vite after changing environment variables.

Run the app and checks:

```powershell
npm.cmd run dev
npm.cmd run lint
npm.cmd run build
```

## Database setup

Apply migrations in timestamp order. The initial schema is in [`supabase/migrations/20261003210000_initial_finance_schema.sql`](./supabase/migrations/20261003210000_initial_finance_schema.sql); profile preferences and multi-currency support are in [`supabase/migrations/20261003220000_profile_preferences_multi_currency.sql`](./supabase/migrations/20261003220000_profile_preferences_multi_currency.sql). Review and run each required migration against the intended Supabase project using the Supabase SQL Editor or the Supabase CLI. Do not mark a migration applied until execution succeeds.

The migration creates user-owned profiles, accounts, categories, transactions, transfers, budgets, financial goals, and notifications. It adds ownership constraints, indexes, updated-at and profile/category seed triggers, the transfer and dashboard RPCs, and RLS policies. Existing Auth users are backfilled with a profile and default categories.

All account balances are derived from opening balances, income/expense transactions, and transfers; there is no separately mutated balance column. Transfers are stored once and net to zero across the source and destination accounts, and are excluded from income and expense totals. Profile preferences support Indonesian, English, Malay, Japanese, and Simplified Chinese, plus IDR, USD, EUR, GBP, JPY, CNY, MYR, SGD, AUD, CAD, CHF, SAR, KRW, THB, and INR.

Each account, budget, goal, and the transactions recorded against an account retain their own currency. Changing the preferred currency does not rewrite stored amounts or convert existing data. Dashboard aggregate totals and charts include records denominated in the selected preference currency; individual accounts and transactions display their original currency. No exchange-rate conversion is implemented. Record currencies are immutable after creation to prevent historical balances from being silently relabelled.

## Data access and security

Supabase requests are centralized in `src/services/financeService.js`. The database enforces ownership with `auth.uid()` RLS policies and owner-consistent foreign keys. Transfer creation is an authenticated, idempotent RPC. The frontend uses only the publishable key; user IDs supplied by the client are checked by RLS.

Supabase Auth email confirmation and password-reset redirects must be configured for the local and deployed app URLs in the Supabase dashboard. Both migrations must be applied before using profile preferences or multi-currency financial-data features.
