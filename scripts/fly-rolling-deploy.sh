#!/usr/bin/env bash
#
# Roll the Fly machines of the `nodetool` app onto a new image, one at a time,
# draining each before it is replaced.
#
# `flyctl deploy` restarts a machine with SIGTERM and gives it at most 300 s
# before the kill. A chat turn can run for half an hour, so that window is the
# wrong tool: instead each machine is first sent SIGUSR2, which puts it in the
# drain described in docs/websocket-api.md § Draining — /health answers 503 so
# the proxy stops routing to it, idle sockets close with 1012, new chat_message
# and run_job are refused, and the turns already in flight finish. Only once
# /health reports no turns and no jobs is the machine updated.
#
# Requires two machines to roll through (`fly scale count 2`); with one, the
# drain is a plain outage window rather than a handover.
#
# Usage: scripts/fly-rolling-deploy.sh <image-ref>
set -euo pipefail

IMAGE="${1:-}"
if [ -z "$IMAGE" ]; then
  echo "usage: $0 <image-ref>" >&2
  exit 2
fi

APP="${FLY_APP:-nodetool}"
REGION="${FLY_REGION:-fra}"
INTERNAL_HEALTH="http://127.0.0.1:7777/health"
# A turn's own ceiling is well under this; the script is the thing that must
# not give up first.
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-2700}"
DRAIN_POLL_SECONDS=10
# After `machine update` the machine boots, connects to Postgres and loads the
# node registry before /health answers 200.
READY_TIMEOUT_SECONDS="${READY_TIMEOUT_SECONDS:-300}"
READY_POLL_SECONDS=5
# The migration machine boots the image and runs every pending migration.
MIGRATE_TIMEOUT_SECONDS="${MIGRATE_TIMEOUT_SECONDS:-600}"

# The drain signal, sent by a pure-shell scan of /proc: the server is not PID 1
# (docker-entrypoint.sh execs it) and the image ships no procps, so there is no
# pkill to reach for. The scan skips its own pid — the loop's text contains
# "server.mjs", so without that it signals itself and dies mid-scan. The `grep`
# children cannot match: the /proc glob is expanded once, before any of them
# exists.
#
# The count is what makes the exit status mean something. A bare `grep && kill`
# loop exits with the status of its *last* iteration, so a scan that signalled
# the server and then walked past one more non-matching pid returned 1 — and
# `flyctl ssh console` passes that through, which `set -e` read as a failure.
# Now the status answers the only question worth asking: was anything
# signalled?
#
# Single-quoted here on purpose — every $ inside belongs to the remote shell.
# shellcheck disable=SC2016
DRAIN_COMMAND='sh -c "self=$$; signalled=0; for p in /proc/[0-9]*; do pid=${p##*/}; [ $pid = $self ] && continue; if grep -qa server.mjs $p/cmdline 2>/dev/null; then kill -USR2 $pid && echo signalled $pid && signalled=$((signalled + 1)); fi; done; [ $signalled -gt 0 ] || { echo no server.mjs process found >&2; exit 1; }"'

on_machine() {
  local id="$1" command="$2"
  flyctl ssh console -a "$APP" --machine "$id" -C "$command"
}

health_of() {
  on_machine "$1" "curl -s --max-time 10 $INTERNAL_HEALTH" 2>/dev/null || true
}

# One number out of the health payload, or empty when it did not answer.
health_field() {
  printf '%s' "$1" | grep -o "\"$2\":[0-9]*" | head -n1 | cut -d: -f2
}

echo "==> Migrating the database on $IMAGE"
# What fly.toml's release_command does on a `fly deploy`. `machine update` runs
# no release phase, so the migration is run here, on the new image, before any
# machine serves it. db-migrate.mjs takes the migration lock, and the machine
# inherits the app's DATABASE_URL secret.
#
# `machine run` returns once the machine has *started*, not once the command
# has exited, and its own exit code says nothing about the migration's. So the
# machine id is captured, the script waits for `--rm` to have destroyed it, and
# the exit code is read back from the Machines API: a failed migration must
# abort the rollout, not ship code against an un-migrated schema.
MIGRATE_OUTPUT="$(flyctl machine run "$IMAGE" \
  --app "$APP" \
  --region "$REGION" \
  --rm \
  --restart no \
  node /app/backend/db-migrate.mjs | tee /dev/stderr)"
MIGRATE_ID="$(printf '%s' "$MIGRATE_OUTPUT" | grep -o 'Machine ID: [0-9a-f]*' | head -n1 | awk '{print $3}')"
if [ -z "$MIGRATE_ID" ]; then
  echo "::error::could not read the migration machine id from flyctl's output" >&2
  exit 1
fi

echo "==> [$MIGRATE_ID] waiting for the migration to exit"
flyctl machine wait "$MIGRATE_ID" -a "$APP" --state destroyed --wait-timeout "${MIGRATE_TIMEOUT_SECONDS}s"

MIGRATE_EXIT="$(curl -sf -H "Authorization: Bearer ${FLY_API_TOKEN:-$(flyctl auth token)}" \
  "https://api.machines.dev/v1/apps/$APP/machines/$MIGRATE_ID" |
  jq -r '[.events[] | select(.type == "exit") | .request.exit_event.exit_code] | first // "unknown"')"
if [ "$MIGRATE_EXIT" != "0" ]; then
  echo "::error::[$MIGRATE_ID] migration exited with code $MIGRATE_EXIT; aborting the rollout" >&2
  exit 1
fi
echo "==> [$MIGRATE_ID] migration finished"

# Only the machines `fly deploy`/`scale` created for the app process group.
# The group is matched exactly, with no default: a machine without the tag is
# a one-off like the migration machine above, and draining one of those is an
# SSH timeout against a VM that has already exited.
MACHINES="$(flyctl machines list -a "$APP" --json |
  jq -r '.[] | select(.state == "started")
             | select(.config.metadata.fly_process_group == "app")
             | .id')"

if [ -z "$MACHINES" ]; then
  echo "No started machines on $APP to update." >&2
  exit 1
fi

echo "==> Rolling machines: $(echo "$MACHINES" | tr '\n' ' ')"

for id in $MACHINES; do
  echo "==> [$id] draining"
  on_machine "$id" "$DRAIN_COMMAND"

  deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS))
  drained=false
  while [ "$SECONDS" -lt "$deadline" ]; do
    body="$(health_of "$id")"
    turns="$(health_field "$body" turns)"
    jobs="$(health_field "$body" jobs)"
    # The status is what proves the signal landed: turns=0 jobs=0 on a machine
    # that never entered the drain is an idle machine, not a drained one.
    case "$body" in
      *'"status":"draining"'*)
        echo "    [$id] draining: turns=${turns:-?} jobs=${jobs:-?}"
        if [ "${turns:-1}" = "0" ] && [ "${jobs:-1}" = "0" ]; then
          drained=true
          break
        fi
        ;;
      "")
        echo "    [$id] health did not answer; retrying"
        ;;
      *)
        echo "    [$id] not draining yet; re-sending SIGUSR2"
        on_machine "$id" "$DRAIN_COMMAND"
        ;;
    esac
    sleep "$DRAIN_POLL_SECONDS"
  done

  if [ "$drained" != true ]; then
    echo "::error::[$id] did not drain within ${DRAIN_TIMEOUT_SECONDS}s; aborting the rollout" >&2
    exit 1
  fi

  echo "==> [$id] updating to $IMAGE"
  # No --wait-timeout: its accepted value format differs across flyctl
  # versions, and the health poll below is the real gate anyway.
  flyctl machine update "$id" --image "$IMAGE" --yes

  echo "==> [$id] waiting for health"
  deadline=$((SECONDS + READY_TIMEOUT_SECONDS))
  ready=false
  while [ "$SECONDS" -lt "$deadline" ]; do
    case "$(health_of "$id")" in
      *'"status":"ok"'*)
        ready=true
        break
        ;;
    esac
    sleep "$READY_POLL_SECONDS"
  done

  if [ "$ready" != true ]; then
    echo "::error::[$id] did not report healthy within ${READY_TIMEOUT_SECONDS}s after the update" >&2
    exit 1
  fi
  echo "==> [$id] healthy on $IMAGE"
done

echo "==> Rollout complete: $IMAGE"
