-- Prizes v2: each place carries typed items (cash / clothing / other), each
-- item individually gated on the store goal. Data-only transform — the old
-- `prize` string becomes a single fully-gated "other" item, matching v1
-- semantics exactly. Idempotent (per-element guard); the app coerces the old
-- shape defensively either side of this migration (lib/rewards.ts asPrizes).
update public.sales_contests
set prizes = (
  select coalesce(jsonb_agg(
    case
      when p ? 'items' then p
      else (p - 'prize') || jsonb_build_object(
        'items', jsonb_build_array(jsonb_build_object(
          'type', 'other', 'label', p->>'prize', 'requires_goal', true)))
    end
    order by (p->>'place')::int
  ), '[]'::jsonb)
  from jsonb_array_elements(prizes) as p
)
where jsonb_typeof(prizes) = 'array'
  and exists (
    select 1 from jsonb_array_elements(prizes) e
    where (e ? 'prize') and not (e ? 'items')
  );

-- Finalized snapshots: prize string -> prizes label array. Also idempotent.
update public.sales_contests
set results = jsonb_set(results, '{standings}', (
  select coalesce(jsonb_agg(
    case
      when s ? 'prizes' then s
      else (s - 'prize') || jsonb_build_object(
        'prizes',
        case when (s->>'prize') is null then '[]'::jsonb
             else jsonb_build_array(s->'prize') end)
    end
    order by (s->>'place')::int
  ), '[]'::jsonb)
  from jsonb_array_elements(results->'standings') as s
))
where results is not null
  and jsonb_typeof(results->'standings') = 'array'
  and exists (
    select 1 from jsonb_array_elements(results->'standings') s
    where not (s ? 'prizes')
  );
