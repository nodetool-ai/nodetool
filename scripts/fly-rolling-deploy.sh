#!/bin/bash
#
# Roll the Fly machines of the `nodetool` app onto a new image, one at a time,
# draining each before it is replaced when the running image supports it.
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

for required_command in curl flyctl jq; do
  if ! command -v "$required_command" >/dev/null 2>&1; then
    echo "::error::$required_command is required" >&2
    exit 1
  fi
done

APP="${FLY_APP:-nodetool}"
REGION="${FLY_REGION:-fra}"
INTERNAL_HEALTH="http://127.0.0.1:7777/health"
# A turn's own ceiling is well under this; the script is the thing that must
# not give up first.
DRAIN_TIMEOUT_SECONDS="${DRAIN_TIMEOUT_SECONDS:-2700}"
DRAIN_POLL_SECONDS=10
# A new drain handler changes /health immediately. If it does not, this is an
# old image that cannot drain and must be bootstrapped with a plain update.
DRAIN_START_TIMEOUT_SECONDS="${DRAIN_START_TIMEOUT_SECONDS:-30}"
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

# One number out of the health payload, or empty when it did not answer. The
# fallback makes "no match" data rather than an accidental `set -e` verdict:
# under `pipefail`, grep's status otherwise escapes the command substitution.
health_field() {
  printf '%s' "$1" | grep -o "\"$2\":[0-9]*" | head -n1 | cut -d: -f2 || true
}

if [ -n "${FLY_API_TOKEN:-}" ]; then
  API_TOKEN="$FLY_API_TOKEN"
elif ! API_TOKEN="$(flyctl auth token)"; then
  echo "::error::could not read a Fly API token" >&2
  exit 1
fi

# Set MACHINE_STATE and MACHINE_EXIT from one Machines API response. Every
# caller guards this function because API failure is an expected error path,
# not a verdict for `set -e` to choose without a useful message.
load_machine_status() {
  local id="$1" body summary
  if ! body="$(curl -sf -H "Authorization: Bearer $API_TOKEN" \
    "https://api.machines.dev/v1/apps/$APP/machines/$id")"; then
    echo "::error::[$id] could not read machine state from the Machines API" >&2
    return 1
  fi
  if ! summary="$(printf '%s' "$body" | jq -er '
    [.state, ([.events[] | select(.type == "exit") |
      .request.exit_event.exit_code] | first // "unknown")] | @tsv
  ')"; then
    echo "::error::[$id] Machines API response did not contain a valid state" >&2
    return 1
  fi
  IFS=$'\t' read -r MACHINE_STATE MACHINE_EXIT <<< "$summary"
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
if ! MIGRATE_OUTPUT="$(flyctl machine run "$IMAGE" \
  --app "$APP" \
  --region "$REGION" \
  --rm \
  --restart no \
  node /app/backend/db-migrate.mjs | tee /dev/stderr)"; then
  echo "::error::could not start the migration machine" >&2
  exit 1
fi
MIGRATE_ID="$(printf '%s' "$MIGRATE_OUTPUT" | grep -o 'Machine ID: [0-9a-f]*' | head -n1 | awk '{print $3}' || true)"
if [ -z "$MIGRATE_ID" ]; then
  echo "::error::could not read the migration machine id from flyctl's output" >&2
  exit 1
fi

echo "==> [$MIGRATE_ID] waiting for the migration to exit"
flyctl machine wait "$MIGRATE_ID" -a "$APP" --state destroyed --wait-timeout "${MIGRATE_TIMEOUT_SECONDS}s"

if ! load_machine_status "$MIGRATE_ID"; then
  exit 1
fi
MIGRATE_EXIT="$MACHINE_EXIT"
if [ "$MIGRATE_EXIT" != "0" ]; then
  echo "::error::[$MIGRATE_ID] migration exited with code $MIGRATE_EXIT; aborting the rollout" >&2
  exit 1
fi
echo "==> [$MIGRATE_ID] migration finished"

# Only the machines `fly deploy`/`scale` created for the app process group.
# The group is matched exactly, with no default: a machine without the tag is
# a one-off like the migration machine above, and draining one of those is an
# SSH timeout against a VM that has already exited.
if ! MACHINES="$(flyctl machines list -a "$APP" --json |
  jq -r '.[] | select(.state == "started" or .state == "stopped")
             | select(.config.metadata.fly_process_group == "app")
             | .id')"; then
  echo "::error::could not list machines for $APP" >&2
  exit 1
fi

if [ -z "$MACHINES" ]; then
  echo "No started or stopped app machines on $APP to update." >&2
  exit 1
fi

echo "==> Rolling machines: $(echo "$MACHINES" | tr '\n' ' ')"

for id in $MACHINES; do
  echo "==> [$id] draining"
  if ! load_machine_status "$id"; then
    exit 1
  fi
  exit_before_signal="$MACHINE_EXIT"
  bootstrap_update=false
  case "$MACHINE_STATE" in
    stopped)
      if [ "$MACHINE_EXIT" = "140" ]; then
        echo "::warning::[$id] is stopped after a legacy SIGUSR2 exit; updating without a drain"
        bootstrap_update=true
      else
        echo "::error::[$id] is already stopped with exit code $MACHINE_EXIT; aborting the rollout" >&2
        exit 1
      fi
      ;;
    destroyed|failed)
      echo "::error::[$id] is already in terminal state $MACHINE_STATE (exit=$MACHINE_EXIT); aborting the rollout" >&2
      exit 1
      ;;
  esac

  if [ "$bootstrap_update" = false ] && ! on_machine "$id" "$DRAIN_COMMAND"; then
    if ! load_machine_status "$id"; then
      exit 1
    fi
    if [ "$MACHINE_STATE" = "stopped" ] && [ "$MACHINE_EXIT" = "140" ]; then
      echo "::warning::[$id] SIGUSR2 stopped a legacy server; updating without a drain"
      bootstrap_update=true
    else
      echo "::error::[$id] could not send SIGUSR2 (state=$MACHINE_STATE exit=$MACHINE_EXIT); aborting the rollout" >&2
      exit 1
    fi
  fi

  deadline=$((SECONDS + DRAIN_TIMEOUT_SECONDS))
  drain_start_deadline=$((SECONDS + DRAIN_START_TIMEOUT_SECONDS))
  drained=false
  while [ "$bootstrap_update" = false ] && [ "$SECONDS" -lt "$deadline" ]; do
    body="$(health_of "$id")"
    if ! load_machine_status "$id"; then
      exit 1
    fi

    if [ "$MACHINE_EXIT" = "140" ] && [ "$exit_before_signal" != "140" ]; then
      echo "::warning::[$id] exited on SIGUSR2 and restarted without draining; updating without another signal"
      bootstrap_update=true
      break
    fi

    case "$MACHINE_STATE" in
      stopped)
        if [ "$MACHINE_EXIT" = "140" ]; then
          echo "::warning::[$id] SIGUSR2 stopped a legacy server; updating without a drain"
          bootstrap_update=true
          break
        fi
        echo "::error::[$id] stopped during drain with exit code $MACHINE_EXIT; aborting the rollout" >&2
        exit 1
        ;;
      destroyed|failed)
        echo "::error::[$id] entered terminal state $MACHINE_STATE during drain (exit=$MACHINE_EXIT); aborting the rollout" >&2
        exit 1
        ;;
    esac

    # The status is what proves the signal landed: turns=0 jobs=0 on a machine
    # that never entered the drain is an idle machine, not a drained one.
    case "$body" in
      *'"status":"draining"'*)
        turns="$(health_field "$body" turns)"
        jobs="$(health_field "$body" jobs)"
        echo "    [$id] draining: turns=${turns:-?} jobs=${jobs:-?}"
        if [ "${turns:-1}" = "0" ] && [ "${jobs:-1}" = "0" ]; then
          drained=true
          break
        fi
        ;;
      "")
        if [ "$SECONDS" -ge "$drain_start_deadline" ]; then
          echo "::error::[$id] health did not answer and state remained $MACHINE_STATE; aborting the rollout" >&2
          exit 1
        fi
        echo "    [$id] health did not answer; state=$MACHINE_STATE"
        ;;
      *)
        if [ "$SECONDS" -ge "$drain_start_deadline" ]; then
          # This is the bootstrap path. Images built before the drain handler
          # cannot acknowledge SIGUSR2. Re-signalling can kill every restart,
          # so update once without draining and let the new image add support.
          echo "::warning::[$id] did not acknowledge SIGUSR2 within ${DRAIN_START_TIMEOUT_SECONDS}s; updating without a drain"
          bootstrap_update=true
          break
        fi
        echo "    [$id] has not acknowledged the drain signal; state=$MACHINE_STATE"
        ;;
    esac
    sleep "$DRAIN_POLL_SECONDS"
  done

  if [ "$drained" != true ] && [ "$bootstrap_update" != true ]; then
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
    body="$(health_of "$id")"
    case "$body" in
      *'"status":"ok"'*)
        ready=true
        break
        ;;
    esac
    if ! load_machine_status "$id"; then
      exit 1
    fi
    case "$MACHINE_STATE" in
      stopped|destroyed|failed)
        echo "::error::[$id] entered terminal state $MACHINE_STATE after the update (exit=$MACHINE_EXIT)" >&2
        exit 1
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
