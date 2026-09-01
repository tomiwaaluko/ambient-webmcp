#!/usr/bin/env bash
# Ignored Build Step for the four Ambient Vercel projects.
# Exit 0 = skip this deployment. Exit 1 = build.
#
# Hobby allows 100 deploys / 24h for the whole team. Four Git-connected
# projects turn every PR into four preview deploys; skip those, and skip
# production when the commit does not touch this origin.

set -u

ROLE="${1:?usage: vercel-ignore-build.sh host|acme|northwind|zenith}"

if [ "${VERCEL_ENV:-}" != "production" ]; then
  echo "Skipping non-production deployment (VERCEL_ENV=${VERCEL_ENV:-unset})"
  exit 0
fi

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT" || exit 1

case "$ROLE" in
  host)
    PATHS=(sites/host src/host src/shared src/checker rules scripts/sync-sites.mjs)
    ;;
  acme)
    PATHS=(sites/acme-booking src/widget src/shared scripts/sync-sites.mjs)
    ;;
  northwind)
    PATHS=(sites/northwind-checkout src/widget src/shared scripts/sync-sites.mjs)
    ;;
  zenith)
    PATHS=(sites/zenith-support src/widget src/shared scripts/sync-sites.mjs)
    ;;
  *)
    echo "Unknown role: $ROLE"
    exit 1
    ;;
esac

PREV="${VERCEL_GIT_PREVIOUS_SHA:-}"
CURR="${VERCEL_GIT_COMMIT_SHA:-HEAD}"

if [ -z "$PREV" ]; then
  echo "No VERCEL_GIT_PREVIOUS_SHA; building"
  exit 1
fi

if git diff --quiet "$PREV" "$CURR" -- "${PATHS[@]}"; then
  echo "No $ROLE-relevant changes between $PREV and $CURR; skipping"
  exit 0
fi

echo "$ROLE-relevant changes between $PREV and $CURR; building"
exit 1
