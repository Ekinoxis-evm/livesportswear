#!/usr/bin/env bash
# Stop hook: prints a one-line resume hint so the next session picks up cleanly.
# Output is shown back to the user in the Stop UI.
set -e

CHANGED=$(git status --porcelain 2>/dev/null | head -3 | awk '{print $2}' | tr '\n' ' ')
BRANCH=$(git branch --show-current 2>/dev/null)
LAST=$(git log -1 --pretty=format:'%h %s' 2>/dev/null)

echo "branch=${BRANCH:-?}  last=${LAST:-?}  changed=${CHANGED:-clean}"
