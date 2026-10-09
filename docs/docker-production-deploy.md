---
layout: page
title: "Production Deploy (Docker)"
permalink: /docker-production-deploy
description: "GitHub release gates, restricted SSH, and rolling Docker releases for api.nodetool.ai."
---

# Production deploy

`api.nodetool.ai` runs on the Docker host `46.224.131.110`. Caddy routes traffic
to `app-1` and `app-2` with cookie affinity. Both replicas use the same Supabase
database, auth project, and storage buckets. Deployment configuration and the
rolling release script live in the adjacent
[nodetool-deploy repository](https://github.com/nodetool-ai/nodetool-deploy),
checked out at `/home/claude/nodetool-deploy` on that host.

## Release chain

A push to `main` starts the Docker image build, User Journeys, and Test
independently. The **Deploy to Docker** workflow runs when any of them
completes. It deploys only when Docker and User Journeys have succeeded for
that exact commit and Test has succeeded or has no run, because Test filters
its push trigger by path. It counts only push runs. It does not wait: the last
workflow to finish triggers the release. It rejects a commit superseded on
`main`. It retains the historical filename
[fly-deploy.yml](https://github.com/nodetool-ai/nodetool/blob/main/.github/workflows/fly-deploy.yml), but does not invoke Fly or
use its credentials. Manual dispatch follows the same gates and uses the
dispatch commit, never a mutable image tag.

The **Deploy server** job connects to the host over SSH and sends only the full
commit SHA. A host-side forced command validates the SHA, rechecks the build
gates and current `main`, and invokes the rolling script with
`ghcr.io/nodetool-ai/nodetool:main-<shortsha>`. The host resolves this to an
immutable digest. GitHub serializes release runs without cancelling a rollout
in progress. The host script also takes a deployment lock.

[web-deploy.yml](https://github.com/nodetool-ai/nodetool/blob/main/.github/workflows/web-deploy.yml) follows **Deploy to Docker**
and checks that its **Deploy server** job succeeded before releasing the same
commit to Cloudflare Pages. A skipped or failed server release cannot promote
the frontend. Cloudflare Pages credentials remain in `web-production`.

## GitHub connection settings

Repository variables:

- `DOCKER_DEPLOY_HOST`: the Docker host IP or hostname.
- `DOCKER_DEPLOY_USER`: the SSH account that owns the deployment checkout.

Repository secrets:

- `DOCKER_DEPLOY_SSH_KEY`: a dedicated Ed25519 private key.
- `DOCKER_DEPLOY_KNOWN_HOSTS`: the host's verified SSH public key entry.

The matching public key in `authorized_keys` uses `restrict` and forces
`/home/claude/nodetool-deploy/bootstrap/github-ssh-deploy.sh`. It permits only a
full release SHA or the read-only `check` probe, not shell commands, forwarding,
or a terminal. The SSH client requires the pinned host key. Database credentials
remain in the host's mode-0600 `.env` and are not copied into Actions.

## Rolling release

The script pulls the image and runs its database migrations once before
changing either replica. It then verifies the peer is healthy, signals SIGUSR2
to drain the selected replica, waits for its turns and jobs to reach zero,
and recreates it. Health must pass before the peer is drained. The saved image
digest changes only after both replacements succeed. A failed migration or
replacement stops the release. Migrations must remain compatible with the
previous image during the handover.

Inspect the running deployment on the host:

```bash
cd /home/claude/nodetool-deploy
docker compose ps
node bootstrap/verify.mjs --public
docker compose logs --tail 100 app-1 app-2
```

For a manual rollback, review schema compatibility and run the rolling script
on the host with a previously deployed immutable image digest. Rollbacks are
not accepted by the restricted GitHub key, which only releases current `main`.
Check [game draft storage compatibility](game-draft-storage.md#server-rollback)
before choosing an image whose game reader predates the dotted draft version
identifiers. Unchanged database schemas do not make those readers compatible.

The [deployment setup guide](https://github.com/nodetool-ai/nodetool-deploy/blob/main/docs/setup.md)
covers DNS, trigger-dispatch handover, pool sizing, and affinity checks.
The retained [Fly guide](fly-production-deploy.md) covers legacy rollback
operations, not the active GitHub release destination.

## Run history retention

The production image sets `NODETOOL_STORAGE_AUTO_CLEANUP=1`. The server sweeps
run trace owners on startup and on its maintenance timer, using each account's
retention settings. Run content expires under `runTraceRetentionDays` and
finished records under `terminalJobRetentionDays`. Keep automatic cleanup
enabled on the hosted service to meet the [privacy policy](https://nodetool.ai/privacy).
Self-hosted operators can override the image setting when configuring their
container. Local desktop installs keep the existing manual cleanup default.
