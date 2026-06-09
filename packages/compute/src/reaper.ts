// Reaper — the cost guard's time-based teardown loop.
//
// GPU pods/Vast instances bill continuously, the laptop sleeps, the app
// crashes. The reaper enforces two profile-declared limits so a forgotten
// worker can't quietly bill for hours, with deliberately different actions:
//
//   - idle auto-stop: PAUSE an instance after `idle_timeout_minutes` of bridge
//     inactivity (the bridge touches `last_activity_at`). Pausing frees the
//     expensive GPU but keeps the volume, so resuming is fast and the model
//     cache survives — the common, recoverable case.
//   - hard TTL: TERMINATE an instance older than `max_lifetime_minutes`
//     regardless of activity — an absolute kill switch that destroys the volume
//     too, so a forgotten pod can't bill volume storage forever.
//
// Both go through the manager (`stop`/`terminate`), so the real provider work
// and the status update happen as one. A profile that sets neither limit opts
// its instances out. The clock and the manager are injected so the windows can
// be exercised deterministically with a fake clock.
//
// Orphan reconcile (diffing the DB against `provider.list()`) is a separate
// concern handled by `WorkerManager.reconcile()` in Task D4.

import type { WorkerInstance, WorkerProfile } from "@nodetool-ai/models";

/**
 * The slice of `WorkerManager` the reaper drives: it reads the registry and
 * tears instances down through the manager (never the provider directly).
 */
export interface ReaperManager {
  list(): Promise<WorkerInstance[]>;
  /** Pause (idle path) — frees the GPU, keeps the volume. */
  stop(instanceId: string): Promise<unknown>;
  /** Destroy (hard-TTL path) — deletes the pod and its volume. */
  terminate(instanceId: string): Promise<unknown>;
}

/**
 * Reaper dependencies. `manager` reads/stops instances; `getProfile` resolves
 * an instance's profile (for its limits); `now` returns the current epoch ms
 * (injected so idle/TTL windows are deterministic in tests).
 */
export interface ReaperDeps {
  manager: ReaperManager;
  getProfile: (name: string) => Promise<WorkerProfile | null>;
  now: () => number;
}

/** A handle that cancels a running `startReaper` timer. */
export type ReaperHandle = () => void;

const MINUTE_MS = 60_000;

/**
 * Run one reaping pass: stop every non-stopped instance that is past its
 * profile's idle window or hard TTL. Instances whose profile is missing or
 * sets neither limit are left untouched.
 */
export async function runReaperOnce(deps: ReaperDeps): Promise<void> {
  const nowMs = deps.now();
  const instances = await deps.manager.list();

  for (const instance of instances) {
    // Already-paused or already-destroyed instances are done.
    if (instance.status === "stopped" || instance.status === "terminated") {
      continue;
    }

    const profile = await deps.getProfile(instance.profile_name);
    if (!profile) {
      continue;
    }

    // Hard TTL wins over idle: if both fire, destroy (the stronger action)
    // rather than merely pause.
    const action = reapAction(instance, profile, nowMs);
    if (action === "terminate") {
      await deps.manager.terminate(instance.id);
    } else if (action === "stop") {
      await deps.manager.stop(instance.id);
    }
  }
}

/**
 * Which teardown (if any) an instance is due for: `terminate` past its hard TTL
 * (destroy, incl. volume), `stop` past its idle window (pause, keep volume), or
 * `null` when neither limit has fired.
 */
function reapAction(
  instance: WorkerInstance,
  profile: WorkerProfile,
  nowMs: number
): "stop" | "terminate" | null {
  const ttl = profile.max_lifetime_minutes;
  if (ttl != null) {
    const ageMs = nowMs - Date.parse(instance.created_at);
    if (ageMs > ttl * MINUTE_MS) {
      return "terminate";
    }
  }

  const idle = profile.idle_timeout_minutes;
  if (idle != null) {
    const idleMs = nowMs - Date.parse(instance.last_activity_at);
    if (idleMs > idle * MINUTE_MS) {
      return "stop";
    }
  }

  return null;
}

/**
 * Schedule `runReaperOnce` on a fixed interval (used by the server). The timer
 * itself is not unit-tested; the returned handle clears it. A pass that throws
 * is swallowed so a transient provider/DB error doesn't kill the loop.
 */
export function startReaper(deps: ReaperDeps, intervalMs: number): ReaperHandle {
  const timer = setInterval(() => {
    void runReaperOnce(deps).catch(() => {});
  }, intervalMs);
  // Don't keep the process alive solely for the reaper.
  if (typeof timer.unref === "function") {
    timer.unref();
  }
  return () => clearInterval(timer);
}
