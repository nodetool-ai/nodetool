# Production deploy (Fly.io)

How `main` reaches https://api.nodetool.ai, what the rolling deploy does to each
machine, and what to do when it stops half way. Self-hosting somebody else's
NodeTool is a different job — see [Self-Hosted Deployment](self-hosted-deployment.md).

The app is `nodetool` on Fly.io, configured by [`fly.toml`](../fly.toml) at the
repo root. Its machines run in `fra`, next to the Supabase database, and the
deploy replaces them one at a time so the others keep serving. That needs at
least two machines (`fly scale count 2`); with one, the drain is an outage
window rather than a handover.

## What triggers a deploy

A push to `main` starts two workflows independently: `docker.yml` builds and
pushes the GHCR image, and `user-journeys.yml` runs the `reliability-ring1`
suite. [`fly-deploy.yml`](../.github/workflows/fly-deploy.yml) triggers on the
*completion* of either, and its `gate` job polls the other for the same commit.
Whichever finishes second is the run that reaches the rollout; both must be
green.

The image tag is `main-<shortsha>` for the exact triggering commit, never
`:latest`. Two `main` builds can finish out of order, and `:latest` would then
point at the wrong commit. `:latest` is used only by a manual
`workflow_dispatch` re-deploy.

`fly-deploy.yml` sets `concurrency: fly-deploy` with `cancel-in-progress: true`.
Because both upstream workflows fire an event, **a run cancelled seconds after
it starts is normal** — the second event superseded the first. A `cancelled`
conclusion next to a later `success` on the same commit is not a failure.

## What the rollout does

[`scripts/fly-rolling-deploy.sh`](../scripts/fly-rolling-deploy.sh) takes the
image ref and does the whole release. In order:

1. **Migrate.** `flyctl machine run --rm --restart no node /app/backend/db-migrate.mjs`
   on the new image. `fly.toml`'s `release_command` covers this for a plain
   `fly deploy`, but `machine update` has no release phase, so the script runs
   it. A failed migration aborts before any machine serves the new code.
2. **List the app machines.** `fly_process_group == "app"`, matched exactly. A
   machine without that tag is a one-off like the migration machine.
3. **For each machine, in turn:** drain it, update it to the new image, wait for
   `/health` to answer `status: "ok"`, then move to the next.

Draining is the point of the script. Fly's own restart sends SIGTERM and waits
at most 300 s, and a chat turn can run for half an hour. So each machine is
first sent **SIGUSR2**, which starts the drain described in
[websocket-api.md § Draining](websocket-api.md#draining): `/health` answers 503
so the proxy stops routing new clients here, idle sockets close with 1012, new
`chat_message` and `run_job` are refused, and turns already in flight finish.
Only when `/health` reports `turns` and `jobs` both 0 is the machine replaced.

A healthy rollout looks like this, with no warnings:

```
==> [<id>] draining
    [<id>] draining: turns=0 jobs=0
==> [<id>] updating to ghcr.io/nodetool-ai/nodetool:main-<sha>
==> [<id>] waiting for health
==> [<id>] healthy on ghcr.io/nodetool-ai/nodetool:main-<sha>
```

### Sending the signal

The image ships no `procps` and the server is not PID 1, so there is no `pkill`.
The script scans `/proc` in pure shell over `flyctl ssh console -C`, skipping its
own pid — the scan's own command line contains `server.mjs`, so without that it
signals itself.

## Bootstrapping a machine that cannot drain

SIGUSR2's default disposition is *terminate*. An image built before the drain
handler landed has no handler, so the signal kills the server instead of
draining it, and the machine exits **140** (128 + 12).

The script therefore sends SIGUSR2 **once** and gives the machine
`DRAIN_START_TIMEOUT_SECONDS` (30) to acknowledge it in `/health`. If it does
not, that is an image without the handler: the machine is updated with no drain,
which is the only way to reach an image that can drain at all. Re-signalling
instead kills every restart until Fly stops restarting the machine.

This path is a one-time transition and it cuts in-flight turns. It is expected
only when the running image predates the handler.

## Machine-state facts the script depends on

These are not obvious and each one caused a failed deploy:

- **`flyctl machine update` preserves a stopped machine's state.** It rewrites
  the config and returns without booting anything — no start event at all. A
  machine updated out of `stopped` must be started explicitly with
  `flyctl machine start`.
- **`flyctl machine run` returns when the machine *starts*, not when its command
  exits**, and its exit code says nothing about the command's. Read the command's
  exit code from the Machines API after waiting for the machine to be destroyed.
- **`flyctl machine status` has no `--json` flag.** Machine state and exit codes
  come from `https://api.machines.dev/v1/apps/<app>/machines/<id>` with
  `Authorization: Bearer $FLY_API_TOKEN`. The `events` array is newest-first.
- **`fly.toml` sets `auto_stop_machines = "off"`.** Nothing stops an app machine
  on purpose, so a stopped one is always a machine to repair, whatever its exit
  code — including no exit event at all, which reads back as `unknown`.
- **A machine mid-boot is not a machine that failed.** `machine update` returns
  before the new process is up, so the post-update state check waits
  `READY_STATE_GRACE_SECONDS` (60) before a non-running state counts as a
  failure.

## Tuning

Every timeout is an environment variable with a default, so a deploy can be
re-run with a different budget without editing the script:

| Variable | Default | What it bounds |
|---|---|---|
| `MIGRATE_TIMEOUT_SECONDS` | 600 | the migration machine reaching `destroyed` |
| `DRAIN_START_TIMEOUT_SECONDS` | 30 | acknowledging SIGUSR2 before the bootstrap path |
| `DRAIN_TIMEOUT_SECONDS` | 2700 | turns and jobs reaching zero |
| `READY_STATE_GRACE_SECONDS` | 60 | booting before a non-running state is a failure |
| `READY_TIMEOUT_SECONDS` | 300 | `/health` answering 200 after the update |

`FLY_APP` (`nodetool`) and `FLY_REGION` (`fra`) are overridable the same way.

## When a deploy fails

Read the machines first. The rollout stops on the machine it was working on, so
the app is usually still serving from the others.

```bash
flyctl machines list -a nodetool --json |
  jq -r '.[] | "\(.id) \(.state) \(.config.image)"'

# state and the exit codes behind it, newest first.
# `flyctl auth token` still works as a fallback but is deprecated; mint one
# with `fly tokens create deploy -a nodetool`.
curl -sf -H "Authorization: Bearer $FLY_API_TOKEN" \
  https://api.machines.dev/v1/apps/nodetool/machines/<id> |
  jq -r '.state, (.events[] | "\(.type) \(.status) exit=\(.request.exit_event.exit_code // "-")")'
```

- **A machine is `stopped`.** `auto_start_machines = true` means the proxy may
  boot it on the next request. To restore capacity now:
  `flyctl machine start <id> -a nodetool`. Re-running the deploy also repairs it.
- **Exit code 140.** SIGUSR2 with no handler. The running image predates the
  drain handler; the bootstrap path above is what gets past it.
- **The rollout aborted but the machines are fine.** Re-run the workflow. The
  script is idempotent: a machine already on the target image drains, updates to
  the same image, and reports healthy.

A manual re-deploy of the current `:latest` is the `workflow_dispatch` trigger on
`fly-deploy.yml`. To roll back, re-run `docker.yml`'s image tag for an older
commit — the tag is `main-<shortsha>`, so any past commit on `main` is directly
deployable.

## Testing the script

`scripts/__tests__/fly-rolling-deploy.test.sh` drives the whole script against
stubbed `flyctl` and `curl` on `PATH`. It runs no real Fly command and touches no
network, and covers the paths that are painful to reach for real: a legacy
SIGUSR2 exit, an image that never acknowledges the drain, a machine left stopped
by an earlier attempt, a machine stopped with no exit event, and a terminal
machine that must abort the rollout.

```bash
npm run test:scripts                              # via the Vitest wrapper
bash scripts/__tests__/fly-rolling-deploy.test.sh # directly, prints each assertion
```

The assertion that matters most is that a bootstrapped machine ends up
**started**, not merely updated. A test that checks only "was it updated" passes
against a machine that never came back.

When you change the script, prove the new test can fail: point `DEPLOY_SCRIPT`
at the previous version and watch it go red.

```bash
git show HEAD:scripts/fly-rolling-deploy.sh > /tmp/old-deploy.sh
DEPLOY_SCRIPT=/tmp/old-deploy.sh bash scripts/__tests__/fly-rolling-deploy.test.sh
```

## Related

- [websocket-api.md § Draining](websocket-api.md#draining) — the drain protocol the script drives
- [Self-Hosted Deployment](self-hosted-deployment.md) — running your own server, outside Fly
- [Deployment Guide](deployment.md) — server vs. worker, and the self-host paths
