-- Every employee gets a color: backfill nulls from the app's palette
-- (src/lib/avatar-palette.ts), assigned deterministically by row order so
-- colleagues get distinct colors. The picker now enforces the palette at
-- create time; this heals rows created by the old free-text field.

with palette as (
  select array[
    '#1f5240','#0e7490','#1d4ed8','#7c3aed','#be185d','#dc2626','#ea580c','#ca8a04',
    '#65a30d','#059669','#0d9488','#6366f1','#a855f7','#e11d48','#78716c','#334155'
  ] as colors
),
numbered as (
  select id, row_number() over (order by created_at) as rn
  from public.employees
  where avatar_color is null
)
update public.employees e
set avatar_color = (select colors[((n.rn - 1) % 16) + 1] from palette)
from numbered n
where e.id = n.id;
