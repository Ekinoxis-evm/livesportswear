-- Seed the "hello" client message (a greeting the store can send any time),
-- per location + language. Uses {name} (client first name) and {last_product}
-- (the last item they bought) tokens; dollar-quoted so emojis / newlines /
-- *bold* / apostrophes need no escaping. Sensible defaults the admin edits on
-- /admin/clients. `on conflict do nothing` keeps any hand-edited body.
insert into public.message_templates (location_id, key, language, body)
select l.id, 'hello', 'pt', $pt$Oi, {name}! 👋 Passando para dizer um oi e ver como você está.

Espero que esteja aproveitando muito o seu {last_product}! Se quiser ver as novidades ou precisar de outra cor ou tamanho, é só me chamar por aqui.

Um ótimo dia! 🫶🏻

*William Martinez*
*LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$pt$
from public.locations l
on conflict (location_id, key, language) do nothing;

insert into public.message_templates (location_id, key, language, body)
select l.id, 'hello', 'en', $en$Hi {name}! 👋 Just checking in to say hello.

I hope you're loving your {last_product}! If you'd like to see what's new or need another color or size, just message me right here.

Have a beautiful day! 🫶🏻

*William Martinez*
 *LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$en$
from public.locations l
on conflict (location_id, key, language) do nothing;

insert into public.message_templates (location_id, key, language, body)
select l.id, 'hello', 'es', $es$¡Hola, {name}! 👋 Solo paso para saludarte.

¡Espero que estés disfrutando muchísimo tu {last_product}! Si quieres ver las novedades o necesitas otro color o talla, escríbeme por aquí.

¡Que tengas un día increíble! 🫶🏻

*William Martinez*
 *LIVE!* : _Livesportswear.com_
723 Lincoln Road, Miami Beach.$es$
from public.locations l
on conflict (location_id, key, language) do nothing;
