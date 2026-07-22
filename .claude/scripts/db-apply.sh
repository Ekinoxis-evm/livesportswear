#!/usr/bin/env bash
# Apply a migration to the PROD Supabase project, then record it and verify.
#
# Why this exists as a script rather than an inline curl:
#   1. `supabase db push` does not work here — the remote history uses timestamp
#      IDs while these files are numbered 0001..NNNN, and the CLI refuses to
#      reconcile the two.
#   2. An inline curl matches no permission rule, so it was approved or blocked
#      unpredictably. One script = one auditable rule in settings.local.json.
#   3. The migration file often lives on a feature branch, not the working tree.
#      Getting that wrong silently reads the wrong file (or none).
#   4. API-applied migrations don't write a schema_migrations row, so the ledger
#      drifted to 0038 while the schema was really at 0044.
#
# Usage:
#   .claude/scripts/db-apply.sh 0044_customer_origin_country
#   .claude/scripts/db-apply.sh branch-name:supabase/migrations/0044_x.sql
#   .claude/scripts/db-apply.sh --check          # print applied vs. on-disk
#
# A successful apply prints "applied" and the ledger row it wrote.
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

REF=$(grep '^SUPABASE_PROJECT_REF=' .env.local | cut -d= -f2-)
TOKEN=$(grep '^SUPABASE_ACCESS_TOKEN=' .env.local | cut -d= -f2-)
[ -n "$REF" ] && [ -n "$TOKEN" ] || { echo "Missing SUPABASE_PROJECT_REF / SUPABASE_ACCESS_TOKEN in .env.local" >&2; exit 1; }

api() {
  # $1 = SQL. Never echoes the token.
  jq -Rs '{query:.}' <<<"$1" | curl -sS -X POST \
    "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" \
    -H "Content-Type: application/json" -d @-
}

if [ "${1:-}" = "--check" ]; then
  echo "== applied (ledger) =="
  api "select name from supabase_migrations.schema_migrations order by version desc limit 10;" \
    | jq -r '.[].name'
  echo
  echo "== on disk =="
  ls supabase/migrations/*.sql | xargs -n1 basename | sed 's/\.sql$//' | tail -10
  exit 0
fi

record() {
  # Mark a migration as applied without running it. Timestamp version to match
  # the format the remote history already uses.
  local name="$1" version
  version=$(date -u +%Y%m%d%H%M%S)
  local out
  out=$(api "insert into supabase_migrations.schema_migrations (version, name)
    select '$version', '$name'
    where not exists (select 1 from supabase_migrations.schema_migrations where name = '$name');")
  if [ "$out" = "[]" ]; then echo "ledger: recorded $version $name"; else echo "ledger: $out" >&2; fi
}

# Backfill rows for migrations applied before this script existed. Applying SQL
# through the Management API doesn't write a schema_migrations row, so the ledger
# read 0038 while the schema was really at 0044 — `--check` was lying.
if [ "${1:-}" = "--record" ]; then
  shift
  [ $# -gt 0 ] || { echo "Usage: db-apply.sh --record <NNNN_name> [...]" >&2; exit 1; }
  for n in "$@"; do record "$(basename "$n" .sql)"; done
  exit 0
fi

TARGET="${1:-}"
[ -n "$TARGET" ] || { echo "Usage: db-apply.sh <NNNN_name | branch:path | --record | --check>" >&2; exit 1; }

# Resolve the SQL: a bare name from the working tree, else a branch:path via git.
if [[ "$TARGET" == *:* ]]; then
  SQL=$(git show "$TARGET")
  NAME=$(basename "${TARGET#*:}" .sql)
else
  NAME="$(basename "$TARGET" .sql)"
  FILE="supabase/migrations/${NAME}.sql"
  if [ -f "$FILE" ]; then
    SQL=$(cat "$FILE")
  else
    # Not on this branch — find the one branch that has it, so a migration
    # written on a feature branch can be applied before that branch merges.
    #
    # Deliberately a plain loop, not `... | while ... | head -1`: `git cat-file
    # -e` exits 128 for every branch missing the file, and under `pipefail` that
    # propagates out of the command substitution and kills the script.
    BRANCH=""
    while read -r b; do
      if git cat-file -e "$b:$FILE" 2>/dev/null; then BRANCH="$b"; break; fi
    done < <(git for-each-ref --format='%(refname:short)' refs/heads)
    [ -n "$BRANCH" ] || { echo "No branch contains $FILE" >&2; exit 1; }
    echo "note: $NAME is not on $(git branch --show-current); reading from '$BRANCH'"
    SQL=$(git show "$BRANCH:$FILE")
  fi
fi

echo "== applying $NAME =="
RESULT=$(api "$SQL")
# The query endpoint returns [] on success, or {"error"...} / a message on failure.
if [ "$RESULT" != "[]" ]; then
  echo "FAILED: $RESULT" >&2
  exit 1
fi
echo "applied"

# Record it, so `--check` and the Supabase CLI tell the truth. Timestamp version
# to match the format the remote history already uses.
VERSION=$(date -u +%Y%m%d%H%M%S)
LEDGER=$(api "insert into supabase_migrations.schema_migrations (version, name)
  select '$VERSION', '$NAME'
  where not exists (select 1 from supabase_migrations.schema_migrations where name = '$NAME');")
[ "$LEDGER" = "[]" ] && echo "ledger: recorded $VERSION $NAME" || echo "ledger: $LEDGER" >&2
