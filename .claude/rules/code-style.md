# Code Style

## TypeScript
- `strict: true` already on. No `any`. Use `unknown` + narrow if external.
- Prefer `type` over `interface` for object shapes (less ambiguity around merging).
- Discriminated unions for variant data — especially `Violation`, `EmailEvent`, `ScheduleStatus`.
- Re-export DB types from `src/types/db.ts`, never import directly from `lib/supabase/types.ts` in app code.

## Server actions
- Live in `src/server/<domain>.ts`.
- First line of every action: Zod-parse the input. Don't trust forms.
- Return `{ ok: true, data }` or `{ ok: false, error }` — no thrown business errors.
- Use the **server** supabase client (`createServerClient`) unless you specifically need service-role; service-role is reserved for admin-only flows and is server-side only.

## Components
- Server Components by default. Client components only when needed (state, effects, browser APIs).
- Client component file MUST start with `"use client"`.
- Form state via `react-hook-form` + `zodResolver`.
- Toasts via `sonner`.

## Imports
- Always use the `@/*` alias for in-repo imports.
- Order: external, then `@/*`, then relative.

## Naming
- Files: `kebab-case.ts`. React components: `PascalCase.tsx`. Hooks: `useThing.ts`.
- Tests: `*.spec.ts` next to nothing (live under `/tests`).

## Comments
- Default: don't write them. Names should explain.
- Write one only for non-obvious *why*: a hidden constraint, a subtle invariant, a workaround.
- Never write "what this code does" comments.
