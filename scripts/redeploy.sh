#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Nodetool "redeploy current main" — one-shot entrypoint
#
# Reproduces a full production redeploy in a single command:
#   1. Refuse if the working tree has uncommitted changes to tracked files
#      (untracked deploy artifacts like .env / cert.pem / web/dist are ignored).
#   2. git fetch + checkout main + fast-forward pull.
#   3. Build web/dist on the host (the bind-mounted frontend) — `npm run build:web`.
#   4. Run ./deploy.sh with the restored prod config (deploy.sh reads the last
#      deploy's PORT/TLS/BIND from .deploy/ports.env, so a bare invocation
#      reproduces the running container's config — see T-20260629-0001).
#   5. Verify: print container /health + a running-image-revision-vs-HEAD match.
#
# Pull vs no-pull:
#   If the local `nodetool-ai/nodetool:latest` image was already built from
#   HEAD (its baked GIT_COMMIT_HASH matches `git rev-parse --short=7 HEAD`),
#   we pass --no-pull to deploy.sh and reuse it. Otherwise deploy.sh pulls the
#   CI-built image for HEAD (waiting for it to appear in the registry).
#
# Idempotent: safe to run twice in a row — the second run finds main already
# up to date, the image already at HEAD (→ --no-pull), rebuilds web/dist, and
# re-runs the rolling deploy, converging on the same healthy container.
#
# Usage:
#   npm run redeploy               # fetch main, build web/dist, rolling-deploy
#   ./scripts/redeploy.sh          # same, invoked directly
#   ./scripts/redeploy.sh --allow-dirty   # warn instead of refusing on dirty tree
#   ./scripts/redeploy.sh --pull          # always pull, even if :latest is at HEAD
#   ./scripts/redeploy.sh -- --slug foo   # forward extra args to deploy.sh
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
IMAGE_NAME="nodetool-ai/nodetool"
IMAGE_TAG="latest"

ALLOW_DIRTY=0
FORCE_PULL=0
DEPLOY_ARGS=()

while (( $# )); do
  case "$1" in
    --allow-dirty) ALLOW_DIRTY=1 ;;
    --pull)        FORCE_PULL=1 ;;
    --) shift; DEPLOY_ARGS+=("$@"); break ;;
    --help|-h)
      sed -n '5,32p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *) DEPLOY_ARGS+=("$1") ;;
  esac
  shift
done

cd "$REPO_ROOT"

echo "=== Nodetool Redeploy (current main) ==="
echo ""

# ── 1. Dirty working-tree guard ──────────────────────────────────────
# Only tracked-file modifications block a redeploy: they would be lost or
# conflict on `git checkout main` / `git pull`. Untracked files (.env,
# cert.pem, web/dist, .deploy/*) are expected on a deploy host, so ignore them.
if [[ -n "$(git status --porcelain --untracked-files=no)" ]]; then
  echo "Working tree has uncommitted changes to tracked files:"
  git status --short --untracked-files=no
  echo ""
  if (( ALLOW_DIRTY )); then
    echo "WARNING: --allow-dirty set — continuing anyway (checkout/pull may fail)."
  else
    echo "ERROR: refusing to redeploy a dirty tree. Commit/stash first, or pass --allow-dirty."
    exit 1
  fi
fi

# ── 2. Fetch + checkout main + fast-forward pull ─────────────────────
echo "--- Syncing main ---"
git fetch origin
git checkout main
git pull --ff-only origin main
HEAD_SHA="$(git rev-parse --short=7 HEAD)"
echo "main is at ${HEAD_SHA}."
echo ""

# ── Decide pull vs no-pull ───────────────────────────────────────────
# Read the git commit baked into the local :latest image (Dockerfile sets
# GIT_COMMIT_HASH to the 7-char short SHA). If it already matches HEAD, reuse
# the image; otherwise let deploy.sh pull the CI-built image for HEAD.
image_commit() {
  docker image inspect "${IMAGE_NAME}:${IMAGE_TAG}" \
    --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
    | sed -n 's/^GIT_COMMIT_HASH=//p' | head -n1
}

NO_PULL_FLAG=()
LOCAL_IMAGE_COMMIT="$(image_commit || true)"
if (( FORCE_PULL )); then
  echo "--pull set — will pull the CI image for ${HEAD_SHA} regardless of local image."
elif [[ -n "$LOCAL_IMAGE_COMMIT" && "$LOCAL_IMAGE_COMMIT" == "$HEAD_SHA" ]]; then
  echo "Local ${IMAGE_NAME}:${IMAGE_TAG} already built from ${HEAD_SHA} — skipping pull (--no-pull)."
  NO_PULL_FLAG=(--no-pull)
else
  echo "Local ${IMAGE_NAME}:${IMAGE_TAG} is at '${LOCAL_IMAGE_COMMIT:-none}', HEAD is ${HEAD_SHA} — will pull CI image."
fi
echo ""

# ── 3. Build the bind-mounted frontend ───────────────────────────────
echo "--- Building web/dist ---"
npm run build:web
echo ""

# ── 4. Rolling deploy with restored prod config ──────────────────────
# deploy.sh lives at the repo root, not in scripts/ alongside this file.
echo "--- Deploying ---"
[[ -x "$REPO_ROOT/deploy.sh" ]] || { echo "ERROR: deploy.sh not found (or not executable) at $REPO_ROOT" >&2; exit 1; }
"$REPO_ROOT/deploy.sh" "${NO_PULL_FLAG[@]}" "${DEPLOY_ARGS[@]}"
echo ""

# ── 5. Verify: health + running-image-revision-vs-HEAD ───────────────
# deploy.sh just rewrote .deploy/ports.env with the effective config; read the
# container name / port / TLS mode back so verification matches what deployed.
PORTS_FILE="$REPO_ROOT/.deploy/ports.env"
CONTAINER="nodetool-server"; PORT="443"; TLS_MODE="certs"
if [[ -f "$PORTS_FILE" ]]; then
  while IFS='=' read -r _k _v; do
    case "$_k" in
      CONTAINER) CONTAINER="$_v" ;;
      PORT)      PORT="$_v" ;;
      TLS_MODE)  TLS_MODE="$_v" ;;
    esac
  done < "$PORTS_FILE"
fi
PROTO=$([[ "$TLS_MODE" != "none" ]] && echo "https" || echo "http")

echo "=== Verification ==="

# Health
HEALTH_OK=0
if curl -fsk "${PROTO}://localhost:${PORT}/health" >/dev/null 2>&1; then
  echo "  health:   PASS (${PROTO}://localhost:${PORT}/health)"
  HEALTH_OK=1
else
  echo "  health:   FAIL (${PROTO}://localhost:${PORT}/health did not return 200)"
fi

# Running-image revision vs HEAD
RUNNING_COMMIT="$(docker inspect "$CONTAINER" \
  --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null \
  | sed -n 's/^GIT_COMMIT_HASH=//p' | head -n1 || true)"
REVISION_OK=0
if [[ -n "$RUNNING_COMMIT" && "$RUNNING_COMMIT" == "$HEAD_SHA" ]]; then
  echo "  revision: PASS (container ${CONTAINER} runs ${RUNNING_COMMIT} == HEAD)"
  REVISION_OK=1
else
  echo "  revision: FAIL (container ${CONTAINER} runs '${RUNNING_COMMIT:-unknown}', HEAD is ${HEAD_SHA})"
fi
echo ""

if (( HEALTH_OK && REVISION_OK )); then
  echo "Redeploy OK — ${CONTAINER} healthy and at HEAD (${HEAD_SHA})."
  exit 0
fi
echo "Redeploy completed with FAILED checks — see above."
exit 1
