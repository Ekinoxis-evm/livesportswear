-- Multi-client attending + drag-reorder for the floor queue.
-- attending_count / attending_return_count: open customers per employee (one
-- person alone in the store can attend several at once; each finish closes
-- one). Invariant maintained in src/server/floor-core.ts (not a trigger):
-- status = 'attending' ⟺ attending_count + attending_return_count > 0.
-- manual_pos: explicit line order written by a kiosk drag; null = rotation
-- order. Precedence in src/lib/floor-queue.ts: bump → manual → rotation.
alter table public.floor_checkins
  add column if not exists attending_count int not null default 0
    check (attending_count >= 0),
  add column if not exists attending_return_count int not null default 0
    check (attending_return_count >= 0),
  add column if not exists manual_pos int;

update public.floor_checkins
  set attending_count = 1
  where status = 'attending' and left_at is null and attending_count = 0;
