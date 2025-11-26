---
layout: page
title: "Execution Strategies"
---



## Overview

NodeTool supports multiple execution strategies through the `JobExecutionManager`:

- **Threaded** — lowest overhead; runs inside the API process for fast dev feedback.
- **Subprocess** — isolates Python state per job while staying on the host.
- **Docker** — strongest isolation with configurable CPU/GPU/memory limits.

Use `ENV=test` to automatically select in-memory storage and test-ready defaults.

## Threaded Execution

- Enabled by default for local development.
- Shares process memory; best for lightweight notebook-style workflows.
- Configure max concurrency via `THREAD_POOL_SIZE` (fallback to CPU count).
- Avoid blocking calls in hot paths; prefer async nodes or background workers.

## Subprocess Execution

- Starts a Python child process per job to isolate imports and state.
- Good for heavier CPU tasks without Docker overhead.
- Communicates progress via pipes; streaming is supported.
- Honor graceful shutdown by handling SIGTERM in long-running nodes.

## Docker Execution

- Use for strongest isolation, GPU scheduling, and clean dependency boundaries.
- **Resource limits:** set `DOCKER_CPU_LIMIT`, `DOCKER_MEMORY_LIMIT`, `DOCKER_SHM_SIZE`, and `DOCKER_PIDS_LIMIT` for each job.
- **Security:** run with non-root users when possible (`DOCKER_USER`), drop NET_ADMIN, mount only required volumes, and avoid host networking for untrusted jobs.
- **Images:** use minimal base images and pin tags; ComfyUI images should include compatible CUDA/cuDNN versions.
- **Pull policy:** cache images locally for speed; tag per workflow to avoid drift.

## Resource Limits

- Threaded/Subprocess: control concurrency with `MAX_WORKFLOW_THREADS` and per-job `timeout` values.
- Docker: combine CPU/memory/pid/shm limits plus GPU device lists; prefer `--gpus '"device=0"'`-style constraints for predictable scheduling.
- Storage: keep asset buckets private or signed; clean temp dirs after each job.

## Security

- Require auth (`AUTH_PROVIDER=static` or `supabase`) in shared environments.
- Disable terminal WebSocket in production (`NODETOOL_ENABLE_TERMINAL_WS` unset).
- Ensure proxy TLS termination for all non-public endpoints.
- Rotate worker and proxy tokens via your secrets manager.
- For Docker, never mount the host Docker socket into jobs; prefer a thin supervisor.

## Testing

- Threaded/Subprocess: `pytest -q tests/workflows/test_threaded_job_execution.py` and `tests/workflows/test_subprocess_job_execution.py`.
- Docker: `pytest -q tests/workflows/test_docker_job_execution.py` and `tests/workflows/test_docker_runners_e2e.py` (requires Docker and optional GPU).
- Use `pytest --cov=src` for coverage; add workflow fixtures in `tests/conftest.py`.

## Troubleshooting

- Streaming stalls: check WebSocket/SSE logs and ensure `stream=true` or WebSocket connection is open.
- Resource exhaustion: raise per-job timeouts and lower concurrency; confirm Docker limits match hardware.
- GPU issues: verify drivers and container runtime, and match CUDA versions between host and image.
- Cleanup: ensure temp paths and volume mounts are pruned between runs.

## Design Notes (previous refactoring memo)

- The refactor consolidated job orchestration into `JobExecutionManager` with pluggable runners.
- Execution runners emit typed events consumed by messaging layers for WebSocket and SSE streaming.
- Future improvements: unified tracing, per-node resource hints, and sandbox profiles for untrusted workloads.
