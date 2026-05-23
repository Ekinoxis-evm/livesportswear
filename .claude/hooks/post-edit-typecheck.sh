#!/usr/bin/env bash
# Runs after Edit/Write tool calls. Fast typecheck on the whole project, with a 30s budget.
# Only runs if a .ts or .tsx file was changed in the last 60 seconds.
set -e

if ! find src -type f \( -name '*.ts' -o -name '*.tsx' \) -newermt '60 seconds ago' 2>/dev/null | grep -q .; then
  exit 0
fi

# Use a soft timeout so the hook never blocks a long edit session.
timeout 30 pnpm tsc --noEmit --pretty false 2>&1 | tail -20 || true
