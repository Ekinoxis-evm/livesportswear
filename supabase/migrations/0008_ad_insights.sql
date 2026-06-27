-- =============================================================================
-- 0008 — Meta Ads insights (marketing spend & ROAS)
--
-- One row per (date, campaign) synced from the Meta Marketing API. Admin-only:
-- marketing data is not employee-scoped, so employees get no policy.
-- =============================================================================
create table if not exists public.ad_insights (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  campaign_id text not null,
  campaign_name text,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  clicks bigint not null default 0,
  purchases int not null default 0,
  revenue numeric(14, 2) not null default 0,
  currency text,
  updated_at timestamptz not null default now(),
  unique (date, campaign_id)
);

create index if not exists ad_insights_date_idx on public.ad_insights (date);

alter table public.ad_insights enable row level security;

create policy "ad_insights_admin_all" on public.ad_insights
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());
