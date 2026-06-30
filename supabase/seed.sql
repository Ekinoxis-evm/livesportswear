-- =============================================================================
-- Seed data for local development. Run with `supabase db reset` against the
-- LOCAL stack only. Never run against a remote project.
-- =============================================================================

-- The two LIVE! stores (both Miami / US Eastern)
insert into public.locations (id, name, slug, timezone, address, color) values
  ('11111111-1111-1111-1111-111111111111', 'Lincoln Road',      'lincoln-road',      'America/New_York', '1111 Lincoln Rd, Miami Beach, FL',  '#ff5733'),
  ('22222222-2222-2222-2222-222222222222', 'International Mall', 'international-mall', 'America/New_York', '1455 NW 107th Ave, Doral, FL',      '#33b1ff');

-- Shift templates per location
insert into public.shift_templates (location_id, name, start_time, end_time, color, default_headcount) values
  ('11111111-1111-1111-1111-111111111111', 'Morning', '09:30', '17:30', '#22c55e', 2),
  ('11111111-1111-1111-1111-111111111111', 'Evening', '14:30', '22:30', '#a855f7', 2),
  ('22222222-2222-2222-2222-222222222222', 'Morning', '09:30', '17:30', '#22c55e', 2),
  ('22222222-2222-2222-2222-222222222222', 'Evening', '14:30', '22:30', '#a855f7', 2);

-- Sample employees — note magic_token is a placeholder; production generates 32-byte random
insert into public.employees (location_id, name, email, role, magic_token, preferred_days_off) values
  ('11111111-1111-1111-1111-111111111111', 'Camila Rojas',    'camila@example.com',   'store_manager', 'seed-lincoln-camila',  array['sunday']),
  ('11111111-1111-1111-1111-111111111111', 'Daniel Vargas',   'daniel@example.com',   'shift_lead',    'seed-lincoln-daniel',  array['monday']),
  ('11111111-1111-1111-1111-111111111111', 'María Quintero',  'maria@example.com',    'shift_lead',    'seed-lincoln-maria',   array['sunday','wednesday']),
  ('11111111-1111-1111-1111-111111111111', 'Andrés Cruz',     'andres@example.com',   'sales_rep',     'seed-lincoln-andres',  array['tuesday']),
  ('11111111-1111-1111-1111-111111111111', 'Valentina Pérez', 'valentina@example.com','sales_rep',     'seed-lincoln-valen',   array['thursday']),
  ('22222222-2222-2222-2222-222222222222', 'Jordan Reyes',    'jordan@example.com',   'store_manager', 'seed-intl-jordan',     array['sunday']),
  ('22222222-2222-2222-2222-222222222222', 'Aisha Patel',     'aisha@example.com',    'shift_lead',    'seed-intl-aisha',      array['monday']),
  ('22222222-2222-2222-2222-222222222222', 'Marcus Lee',      'marcus@example.com',   'sales_rep',     'seed-intl-marcus',     array['wednesday']);
