---
description: Run all preflight checks then deploy to Vercel (preview by default, prod with --prod).
argument-hint: "[--prod]"
---

Deploy to Vercel.

1. Confirm working tree is clean: `git status --porcelain`. If dirty, stop and report.
2. Run in order, halting on failure:
   - `pnpm install --frozen-lockfile`
   - `pnpm lint`
   - `pnpm typecheck`
   - `pnpm test`
   - `pnpm build`
3. If `$ARGUMENTS` contains `--prod`:
   - Ask the user to confirm (one-liner: "Deploy to PRODUCTION?")
   - Only on confirmation, run `pnpm vercel deploy --prod --prebuilt`
4. Otherwise, run `pnpm vercel deploy --prebuilt` (preview).
5. Print the deployment URL.

Never auto-promote a preview to production from inside this command.
