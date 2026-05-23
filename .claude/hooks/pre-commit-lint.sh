#!/usr/bin/env bash
# Lint + typecheck before commit. Wire into git via:
#   ln -s ../../.claude/hooks/pre-commit-lint.sh .git/hooks/pre-commit
set -e

echo "[pre-commit] lint"
pnpm lint
echo "[pre-commit] typecheck"
pnpm typecheck
echo "[pre-commit] tests"
pnpm test
