// Guards so tests never call out to Resend or a real Supabase project.
process.env.RESEND_DRY_RUN = "true";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://sentinel.supabase.invalid";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sentinel-anon-key";
