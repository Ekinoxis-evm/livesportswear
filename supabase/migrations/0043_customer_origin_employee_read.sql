-- Let a rep read the clients they brought in.
--
-- 0042 made customer_origin admin-only, on the reasoning that the portal only
-- ever needed live Shopify counts. It now has a Clients tab: their real book,
-- with contact buttons and a profile per client. That needs the attribution
-- rows themselves.
--
-- Scoped by staff_id, which is the whole security boundary: a rep sees exactly
-- the customers whose FIRST in-store order they rang, and nobody else's. Kept
-- as declarative RLS rather than a service-client action so the scope survives
-- the query being reused somewhere else later.
--
-- SELECT only. Attribution is derived from Shopify order history by the sync;
-- nobody edits it by hand, least of all the person it credits.
create policy "customer_origin_own_clients_read" on public.customer_origin
  for select to authenticated
  using (
    staff_id is not null
    and staff_id = (
      select e.shopify_staff_id
      from public.employees e
      where e.id = public.current_employee_id()
    )
  );
