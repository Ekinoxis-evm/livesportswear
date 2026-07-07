-- Preferred-days-off feature removed from the app (rule, portal form, admin form).
alter table public.employees drop column if exists preferred_days_off;
