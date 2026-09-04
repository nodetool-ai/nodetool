#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEPLOY_SCRIPT="${DEPLOY_SCRIPT:-$REPO_ROOT/scripts/fly-rolling-deploy.sh}"
TEST_ROOT="$(mktemp -d)"
trap 'rm -rf "$TEST_ROOT"' EXIT

failures=0

assert_equal() {
  local expected="$1" actual="$2" message="$3"
  if [ "$actual" != "$expected" ]; then
    echo "not ok - $message (expected $expected, got $actual)" >&2
    failures=$((failures + 1))
  else
    echo "ok - $message"
  fi
}

write_stubs() {
  local bin_dir="$1"
  mkdir -p "$bin_dir"

  cat > "$bin_dir/flyctl" <<'STUB'
#!/bin/bash
set -euo pipefail

case "$*" in
  machine\ run\ *)
    echo "Machine ID: aaaa"
    ;;
  machine\ wait\ aaaa\ *)
    ;;
  machines\ list\ *)
    case "$TEST_SCENARIO" in
      previously_stopped_legacy|stopped_without_exit_event) state=stopped ;;
      *) state=started ;;
    esac
    printf '[{"id":"bbbb","state":"%s","config":{"metadata":{"fly_process_group":"app"}}}]\n' "$state"
    ;;
  ssh\ console\ *)
    if [[ "$*" == *server.mjs* ]]; then
      count=$(cat "$TEST_STATE/signals" 2>/dev/null || printf 0)
      printf '%s\n' "$((count + 1))" > "$TEST_STATE/signals"
      exit 0
    fi

    health_count=$(cat "$TEST_STATE/health_requests" 2>/dev/null || printf 0)
    printf '%s\n' "$((health_count + 1))" > "$TEST_STATE/health_requests"
    case "$TEST_SCENARIO" in
      previously_stopped_legacy|stopped_without_exit_event)
        # A stopped machine answers nothing until something starts it.
        if [ -f "$TEST_STATE/started" ]; then
          printf '%s\n' '{"status":"ok","turns":0,"jobs":0}'
        fi
        exit 0
        ;;
    esac
    if [ -f "$TEST_STATE/updated" ]; then
      printf '%s\n' '{"status":"ok","turns":0,"jobs":0}'
    elif [ "$TEST_SCENARIO" = "legacy_sigusr2_exit" ] || [ "$TEST_SCENARIO" = "no_drain_handler" ]; then
      printf '%s\n' '{"status":"ok","turns":0,"jobs":0}'
    fi
    ;;
  machine\ update\ bbbb\ *)
    touch "$TEST_STATE/updated"
    ;;
  machine\ start\ bbbb\ *)
    touch "$TEST_STATE/started"
    ;;
  "auth token")
    echo "test-token"
    ;;
  *)
    echo "unexpected flyctl call: $*" >&2
    exit 64
    ;;
esac
STUB

  cat > "$bin_dir/curl" <<'STUB'
#!/bin/bash
set -euo pipefail

url="${*: -1}"
case "$url" in
  */machines/aaaa)
    printf '%s\n' '{"state":"destroyed","events":[{"type":"exit","request":{"exit_event":{"exit_code":0}}}]}'
    ;;
  */machines/bbbb)
    count=$(cat "$TEST_STATE/state_requests" 2>/dev/null || printf 0)
    printf '%s\n' "$((count + 1))" > "$TEST_STATE/state_requests"
    if [ "$TEST_SCENARIO" = "legacy_sigusr2_exit" ]; then
      signals=$(cat "$TEST_STATE/signals" 2>/dev/null || printf 0)
      if [ "$signals" -eq 0 ]; then
        printf '%s\n' '{"state":"started","events":[{"type":"exit","request":{"exit_event":{"exit_code":1}}}]}'
      else
        printf '%s\n' '{"state":"started","events":[{"type":"exit","request":{"exit_event":{"exit_code":140}}}]}'
      fi
    elif [ "$TEST_SCENARIO" = "no_drain_handler" ]; then
      printf '%s\n' '{"state":"started","events":[{"type":"exit","request":{"exit_event":{"exit_code":1}}}]}'
    elif [ "$TEST_SCENARIO" = "previously_stopped_legacy" ]; then
      if [ -f "$TEST_STATE/started" ]; then
        printf '%s\n' '{"state":"started","events":[{"type":"exit","request":{"exit_event":{"exit_code":140}}}]}'
      else
        printf '%s\n' '{"state":"stopped","events":[{"type":"exit","request":{"exit_event":{"exit_code":140}}}]}'
      fi
    elif [ "$TEST_SCENARIO" = "stopped_without_exit_event" ]; then
      # An aborted rollout leaves a machine stopped with no exit event at all,
      # so the exit code reads back as "unknown".
      if [ -f "$TEST_STATE/started" ]; then
        printf '%s\n' '{"state":"started","events":[]}'
      else
        printf '%s\n' '{"state":"stopped","events":[]}'
      fi
    else
      printf '%s\n' '{"state":"failed","events":[{"type":"exit","request":{"exit_event":{"exit_code":1}}}]}'
    fi
    ;;
  *)
    echo "unexpected curl call: $*" >&2
    exit 64
    ;;
esac
STUB

  cat > "$bin_dir/sleep" <<'STUB'
#!/bin/bash
/bin/sleep 0.1
STUB

  cat > "$bin_dir/tee" <<'STUB'
#!/bin/bash
/bin/cat
STUB

  chmod +x "$bin_dir/flyctl" "$bin_dir/curl" "$bin_dir/sleep" "$bin_dir/tee"
}

run_scenario() {
  local scenario="$1"
  local state_dir="$TEST_ROOT/$scenario"
  local bin_dir="$state_dir/bin"
  mkdir -p "$state_dir"
  write_stubs "$bin_dir"

  set +e
  PATH="$bin_dir:$PATH" \
    TEST_STATE="$state_dir" \
    TEST_SCENARIO="$scenario" \
    FLY_API_TOKEN="test-token" \
    DRAIN_TIMEOUT_SECONDS=2 \
    DRAIN_START_TIMEOUT_SECONDS=1 \
    READY_TIMEOUT_SECONDS=2 \
    bash "$DEPLOY_SCRIPT" "registry.example/nodetool:test" \
      > "$state_dir/output" 2>&1
  scenario_status=$?
  set -e
}

run_scenario legacy_sigusr2_exit
assert_equal 0 "$scenario_status" "a SIGUSR2 exit bootstraps with a plain update"
assert_equal 1 "$(cat "$TEST_ROOT/legacy_sigusr2_exit/signals" 2>/dev/null || printf 0)" "SIGUSR2 is sent once"
assert_equal yes "$([ -f "$TEST_ROOT/legacy_sigusr2_exit/updated" ] && printf yes || printf no)" "the legacy machine is updated"

run_scenario no_drain_handler
assert_equal 0 "$scenario_status" "a missing drain acknowledgement bootstraps after the short capability timeout"
assert_equal 1 "$(cat "$TEST_ROOT/no_drain_handler/signals" 2>/dev/null || printf 0)" "an unacknowledged SIGUSR2 is not re-sent"
assert_equal yes "$([ -f "$TEST_ROOT/no_drain_handler/updated" ] && printf yes || printf no)" "a machine without the handler is updated"

run_scenario previously_stopped_legacy
assert_equal 0 "$scenario_status" "a legacy machine left stopped by an earlier attempt is bootstrapped"
assert_equal 0 "$(cat "$TEST_ROOT/previously_stopped_legacy/signals" 2>/dev/null || printf 0)" "a previously stopped machine is not signalled"
assert_equal yes "$([ -f "$TEST_ROOT/previously_stopped_legacy/updated" ] && printf yes || printf no)" "a previously stopped legacy machine is updated"

assert_equal yes "$([ -f "$TEST_ROOT/previously_stopped_legacy/started" ] && printf yes || printf no)" "a bootstrapped machine is started, because machine update leaves it stopped"

run_scenario stopped_without_exit_event
assert_equal 0 "$scenario_status" "a machine stopped with no exit event is repaired, not treated as terminal"
assert_equal yes "$([ -f "$TEST_ROOT/stopped_without_exit_event/updated" ] && printf yes || printf no)" "a machine stopped with an unknown exit code is updated"
assert_equal yes "$([ -f "$TEST_ROOT/stopped_without_exit_event/started" ] && printf yes || printf no)" "a machine stopped with an unknown exit code is started"
assert_equal 0 "$(cat "$TEST_ROOT/stopped_without_exit_event/signals" 2>/dev/null || printf 0)" "a stopped machine is never signalled"

run_scenario terminal_failed
assert_equal 1 "$scenario_status" "a machine in a terminal state aborts the rollout"
assert_equal 1 "$(cat "$TEST_ROOT/terminal_failed/state_requests" 2>/dev/null || printf 0)" "terminal state is detected by the preflight check"
assert_equal 0 "$(cat "$TEST_ROOT/terminal_failed/health_requests" 2>/dev/null || printf 0)" "a terminal machine is not health-polled until timeout"
assert_equal 0 "$(cat "$TEST_ROOT/terminal_failed/signals" 2>/dev/null || printf 0)" "a terminal machine is not signalled"
assert_equal no "$([ -f "$TEST_ROOT/terminal_failed/updated" ] && printf yes || printf no)" "a terminal machine is not updated"

if [ "$failures" -ne 0 ]; then
  echo "$failures assertion(s) failed" >&2
  exit 1
fi
