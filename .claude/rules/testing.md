# Testing

## Layout
- All tests live in `/tests/*.spec.ts`.
- Vitest is the runner (`pnpm test`).

## Coverage gates
- `src/lib/scheduling/*` MUST stay at 100% line coverage. CI fails below.
- The other pure domain libs (rewards, floor-queue/state, breaks, commission,
  conversion, attendance, monthly-series, shopify-range) each have their own
  spec file and are expected to keep full behavioral coverage, though only the
  scheduling gate is CI-enforced.

## Test types
- **Pure unit tests** (default) for `lib/scheduling/*`. No mocks needed — inputs are plain objects.
- **Integration tests** for server actions: spin up a Supabase test schema if needed, or use the in-memory mock client (`@supabase/supabase-js` mock pattern).
- **Snapshot tests** for email templates (rendered HTML).
- **No e2e in v1.** Playwright comes in Phase 7+ if we add the public time-off form.

## Patterns
- AAA: Arrange, Act, Assert. Never more than 5 lines of arrange.
- Test names are sentences: `"blocks publish when employee has more than max_days_per_week"`.
- One assertion per test where reasonable; if multiple, group with `it.each`.
- Avoid testing internal helper functions — test the behavior of the exported API.

## Deterministic time
- Use `vi.useFakeTimers()` and `vi.setSystemTime(new Date("2025-06-02T09:00:00Z"))` whenever time matters.
- Never write tests that read `new Date()` for "now".

## Resend / Supabase guards
- A vitest `setup.ts` sets `RESEND_DRY_RUN=true` and `NEXT_PUBLIC_SUPABASE_URL` to a sentinel.
- Tests that would call out fail fast with a clear error.
