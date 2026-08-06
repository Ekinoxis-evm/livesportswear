-- Who walked out, not just why. The no-sale flow records reasons, but a reason
-- chip alone can't tell a returning client who couldn't find her size from a
-- stranger who'd never heard of the brand. The kiosk now asks two questions
-- BEFORE the reason, and stores the answers here.
--
-- Text-with-check rather than boolean: "unsure" is a real answer. A rep who
-- never got to ask must not be forced into a yes/no, and a nullable boolean
-- would conflate "not sure" with "never captured". NULL means not captured —
-- every pre-0061 row, and every sold / return / re-take row.
--
-- Report-only labels, exactly like return_type (0041): conversion, commission
-- and contests still key on kind/sold and are unaffected.
alter table public.client_events
  add column if not exists bought_before text
    check (bought_before in ('yes', 'no', 'unsure')),
  add column if not exists knew_brand text
    check (knew_brand in ('yes', 'no', 'unsure'));

comment on column public.client_events.bought_before is
  'No-sale walk-in: had this client bought from LIVE! before? yes|no|unsure; null = not captured.';

comment on column public.client_events.knew_brand is
  'No-sale walk-in: did this client already know LIVE!? yes|no|unsure; null = not captured.';
