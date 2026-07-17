-- Prize-centric contests (v3) + monthly personal goals.
--
-- 1. employee_goals: a rep's monthly sales target, configured in Sales &
--    Rewards setup (mirror of store_goals). Contests with
--    personal_source='monthly' measure each rep's month against it.
create table if not exists public.employee_goals (
  employee_id uuid not null references public.employees(id) on delete cascade,
  year        int not null,
  month       int not null check (month between 1 and 12),
  goal_amount numeric(12,2) not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (employee_id, year, month)
);

create trigger employee_goals_updated_at
  before update on public.employee_goals
  for each row execute function public.tg_set_updated_at();

alter table public.employee_goals enable row level security;

create policy "employee_goals_admin_all" on public.employee_goals
  for all to authenticated
  using (public.admin_can_access_location(public.employee_location(employee_id)))
  with check (public.admin_can_access_location(public.employee_location(employee_id)));

create policy "employee_goals_self_read" on public.employee_goals
  for select to authenticated
  using (employee_id = public.current_employee_id());

-- 2. Which personal goal a contest's personal conditions measure: targets
--    typed into the contest (custom, over the challenge window) or the reps'
--    monthly goals above (whole end-date month).
alter table public.sales_contests
  add column if not exists personal_source text not null default 'custom'
    check (personal_source in ('custom', 'monthly'));

-- 3. Prizes v3: a contest is a flat list of PRIZES, each with its own
--    combinable conditions (position in the challenge ranking, minimum sales,
--    store goal, personal goal). The v2 place-shape explodes losslessly: each
--    item of each place becomes one prize whose conditions are the place's
--    position/minimum plus that item's own flags. Idempotent (v3 rows with a
--    `conditions` key pass through).
update public.sales_contests
set prizes = (
  select coalesce(jsonb_agg(prize), '[]'::jsonb)
  from (
    select case
      when p ? 'conditions' then p
      else jsonb_build_object(
        'items', jsonb_build_array(i - 'requires_goal' - 'requires_personal'),
        'conditions', jsonb_build_object(
          'position', p->'place',
          'min_sales', coalesce(p->'min_sales', 'null'::jsonb),
          'requires_store_goal', coalesce(i->'requires_goal', 'false'::jsonb),
          'requires_personal_goal', coalesce(i->'requires_personal', 'false'::jsonb)
        )
      )
    end as prize
    from jsonb_array_elements(prizes) as p
    left join lateral jsonb_array_elements(
      case when p ? 'conditions' then '[null]'::jsonb else coalesce(p->'items', '[]'::jsonb) end
    ) as i on true
    where (p ? 'conditions') or (i is not null)
  ) exploded
)
where jsonb_typeof(prizes) = 'array'
  and exists (
    select 1 from jsonb_array_elements(prizes) e
    where not (e ? 'conditions')
  );
