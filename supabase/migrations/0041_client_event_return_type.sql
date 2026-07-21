-- Return / Exchange / Both — a report-only label on a return event.
--
-- The kiosk return flow collapses returns and exchanges into kind='return'.
-- This adds a nullable sub-type so the daily report and the attendance list can
-- distinguish them. It does NOT change any metric: conversion/returns counting
-- still keys on `kind` (src/lib/conversion.ts), so kind stays 'walkin'|'return'.
alter table public.client_events
  add column if not exists return_type text
    check (return_type in ('return', 'exchange', 'both'));
