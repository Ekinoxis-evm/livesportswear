#!/usr/bin/env bash
# Runs after Edit/Write tool calls: fast whole-project typecheck, 30s budget.
# (BSD/macOS find has no -newermt, so no freshness guard — the hook only fires
# on Edit/Write anyway, and tsc on a warm cache is quick.)
set -e

# Soft timeout so the hook never blocks a long edit session; `timeout` may be
# missing on stock macOS (coreutils), so fall back to a plain run.
if command -v timeout >/dev/null 2>&1; then
  timeout 30 pnpm tsc --noEmit --pretty false 2>&1 | tail -20 || true
else
  pnpm tsc --noEmit --pretty false 2>&1 | tail -20 || true
fi
