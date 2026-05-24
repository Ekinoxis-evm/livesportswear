-- =============================================================================
-- 0001 — Initial schema for Live staff scheduling
--
-- Authoritative source: .claude/rules/data-model.md and PLAN.md §3
-- =============================================================================

-- gen_random_uuid() is built into Postgres 13+; no extension required.

-- -----------------------------------------------------------------------------
-- locations
-- -----------------------------------------------------------------------------
create table public.locations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  slug        text not null unique,
  address     text,
  timezone    text not null,
  color       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
comment on table public.locations is 'A physical Live Active Wear store.';
comment on column public.locations.timezone is 'IANA timezone, e.g. America/Bogota.';

-- -----------------------------------------------------------------------------
-- employees
-- -----------------------------------------------------------------------------
create type public.employee_role as enum ('sales_rep', 'shift_lead', 'store_manager');

create table public.employees (
  id                   uuid primary key default gen_random_uuid(),
  location_id          uuid not null references public.locations(id) on delete restrict,
  name                 text not null,
  email                text not null unique,
  phone                text,
  avatar_color         text,
  role                 public.employee_role not null default 'sales_rep',
  weekly_hour_target   int not null default 40,
  max_days_per_week    int not null default 5,
  weekly_days_off      int not null default 2,
  preferred_days_off   text[] not null default '{}',
  hire_date            date,
  active               boolean not null default true,
  magic_token          text not null unique,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  constraint employees_max_days_check check (max_days_per_week between 1 and 7),
  constraint employees_weekly_days_off_check check (weekly_days_off between 0 and 6),
  constraint employees_hour_target_check check (weekly_hour_target between 0 and 80)
);
create index employees_location_active_idx on public.employees (location_id, active);

-- -----------------------------------------------------------------------------
-- shift_templates
-- -----------------------------------------------------------------------------
create table public.shift_templates (
  id                 uuid primary key default gen_random_uuid(),
  location_id        uuid not null references public.locations(id) on delete cascade,
  name               text not null,
  start_time         time not null,
  end_time           time not null,
  color              text,
  default_headcount  int not null default 1,
  active             boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint shift_templates_headcount_check check (default_headcount >= 0)
);
create index shift_templates_location_idx on public.shift_templates (location_id, active);

-- -----------------------------------------------------------------------------
-- schedules
-- -----------------------------------------------------------------------------
create type public.schedule_status as enum ('draft', 'published');

create table public.schedules (
  id            uuid primary key default gen_random_uuid(),
  location_id   uuid not null references public.locations(id) on delete cascade,
  week_start    date not null,
  status        public.schedule_status not null default 'draft',
  published_at  timestamptz,
  published_by  uuid,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (location_id, week_start),
  constraint schedules_monday_check check (extract(isodow from week_start) = 1)
);
create index schedules_status_idx on public.schedules (status, week_start);

-- -----------------------------------------------------------------------------
-- shifts
-- -----------------------------------------------------------------------------
create table public.shifts (
  id                 uuid primary key default gen_random_uuid(),
  schedule_id        uuid not null references public.schedules(id) on delete cascade,
  employee_id        uuid not null references public.employees(id) on delete restrict,
  date               date not null,
  shift_template_id  uuid references public.shift_templates(id) on delete set null,
  start_time         time not null,
  end_time           time not null,
  notes              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index shifts_schedule_employee_date_idx on public.shifts (schedule_id, employee_id, date);
create index shifts_date_idx on public.shifts (date);
create index shifts_employee_date_idx on public.shifts (employee_id, date);

-- -----------------------------------------------------------------------------
-- time_off_requests
-- -----------------------------------------------------------------------------
create type public.time_off_status as enum ('pending', 'approved', 'rejected');

create table public.time_off_requests (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references public.employees(id) on delete cascade,
  start_date    date not null,
  end_date      date not null,
  reason        text,
  status        public.time_off_status not null default 'pending',
  submitted_at  timestamptz not null default now(),
  decided_at    timestamptz,
  decided_by    uuid,
  decided_note  text,
  constraint time_off_range_check check (end_date >= start_date)
);
create index time_off_employee_status_idx on public.time_off_requests (employee_id, status);
create index time_off_status_idx on public.time_off_requests (status, start_date);

-- -----------------------------------------------------------------------------
-- audit_log
-- -----------------------------------------------------------------------------
create table public.audit_log (
  id          bigserial primary key,
  actor       uuid,
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  diff        jsonb,
  created_at  timestamptz not null default now()
);
create index audit_log_entity_idx on public.audit_log (entity, entity_id, created_at desc);

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  for t in select unnest(array['locations','employees','shift_templates','schedules','shifts']) loop
    execute format(
      'create trigger %I_updated_at before update on public.%I for each row execute function public.tg_set_updated_at();',
      t, t
    );
  end loop;
end$$;
