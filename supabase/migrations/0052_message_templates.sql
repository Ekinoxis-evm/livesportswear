-- Admin-editable client messages, per location + language.
--
-- The store WhatsApps clients a thank-you after a sale, in 3 languages. The text
-- is editable by admins (on /admin/clients) and read by the kiosk to build the
-- message. `key` leaves room for other message kinds later; `thank_you` is the
-- only one today. `{name}` is the sole token — the kiosk fills it with the
-- client's first name (dropped cleanly if absent); the products just bought are
-- appended automatically, so no product token is needed.
create table if not exists public.message_templates (
  location_id uuid not null references public.locations(id) on delete cascade,
  key         text not null default 'thank_you',
  language    text not null check (language in ('pt', 'en', 'es')),
  body        text not null,
  updated_at  timestamptz not null default now(),
  primary key (location_id, key, language)
);

alter table public.message_templates enable row level security;

-- Admin-only, location-scoped (mirrors store_report_recipients). The kiosk reads
-- through a service-client store action scoped by its JWT location, so it needs
-- no policy of its own.
create policy "message_templates_admin_all" on public.message_templates
  for all to authenticated
  using (public.admin_can_access_location(location_id))
  with check (public.admin_can_access_location(location_id));

create trigger set_message_templates_updated_at
  before update on public.message_templates
  for each row execute function public.tg_set_updated_at();

-- Seed the three thank-you messages for every location. Dollar-quoted so the
-- emojis / newlines / *bold* markers / apostrophes need no escaping.
insert into public.message_templates (location_id, key, language, body)
select l.id, 'thank_you', 'pt', $pt$Muito obrigado pela sua compra hoje! Esperamos que você adore as suas roupas novas.

Lembrando que se você vir algo que goste online, pode fazer o pedido direto por aqui no WhatsApp! Além disso, temos FRETE GRÁTIS:
- *EUA:* Em compras acima de $100
- *Internacional:* Em compras acima de $300

Tenha um dia maravilhoso! 🫶🏻

*William Martinez*
*LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$pt$
from public.locations l
on conflict (location_id, key, language) do nothing;

insert into public.message_templates (location_id, key, language, body)
select l.id, 'thank_you', 'en', $en$Good morning, {name}!

Thank you so much for shopping with us today! We hope you love your new pieces.

Just a reminder: if you see something you like online, you can message us right here to order or help you to find more colors or designs!

We have FREE shipping:
- *USA:* Over $100
- *Worldwide:* Over $300

Have a beautiful day! 🫶🏻

*William Martinez*
 *LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$en$
from public.locations l
on conflict (location_id, key, language) do nothing;

insert into public.message_templates (location_id, key, language, body)
select l.id, 'thank_you', 'es', $es$¡Muchísimas gracias por tu compra hoy! Esperamos que disfrutes un montón tus prendas nuevas.

Recuerda que si ves algo que te guste online, ¡puedes pedirlo directamente por aquí en WhatsApp! Además, tenemos ENVÍO GRATIS:
- *EE. UU.:* En compras de más de $100
- *Internacional:* En compras de más de $300

¡Que tengas un día increíble! 🫶🏻

*William Martinez*
 *LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$es$
from public.locations l
on conflict (location_id, key, language) do nothing;
