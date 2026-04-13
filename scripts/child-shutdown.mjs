import { spawnSync } from "node:child_process";

function getExitCodeForSignal(signal) {
  if (signal === "SIGINT") {
    return 130;
  }

  if (signal === "SIGTERM") {
    return 143;
  }

  return 1;
}

export function killProcessTree(pid, platform = process.platform) {
  if (!pid) {
    return;
  }

  if (platform === "win32") {
    spawnSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    return;
  }

  try {
    // Negative PID signals the whole process group — required when the child
    // was spawned with `detached: true` (its own process group), because a
    // terminal SIGINT in the parent does not propagate there.
    process.kill(-pid, "SIGTERM");
  } catch {
    // Child already exited.
  }
}

/**
 * Register parent-process signal handlers that kill a spawned child (and its
 * process group) before exiting.
 *
 * Behaves on both Windows and Unix — on Windows the tree is killed via
 * `taskkill /F /T`, on Unix via `process.kill(-pid, SIGTERM)`. Historically
 * this was a no-op off Windows under the assumption that terminal signals
 * reach the child via the shared process group; that assumption breaks as
 * soon as a caller uses `detached: true` (e.g. `run-websocket-dev.mjs`), so
 * the handlers now run on every platform.
 */
export function registerChildShutdownHandlers({
  child,
  processLike = process,
  platform = process.platform,
  killTree = (pid) => killProcessTree(pid, platform)
}) {
  if (!child?.pid) {
    return () => {};
  }

  let cleanedUp = false;
  const listeners = [];

  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    for (const [event, listener] of listeners) {
      processLike.off(event, listener);
    }
  };

  const exitWithSignal = (signal) => {
    killTree(child.pid);
    cleanup();
    processLike.exit(getExitCodeForSignal(signal));
  };

  const signals = platform === "win32"
    ? ["SIGINT", "SIGTERM", "SIGBREAK"]
    : ["SIGINT", "SIGTERM"];

  for (const signal of signals) {
    const listener = () => exitWithSignal(signal);
    listeners.push([signal, listener]);
    processLike.once(signal, listener);
  }

  const exitListener = () => {
    killTree(child.pid);
    cleanup();
  };
  listeners.push(["exit", exitListener]);
  processLike.once("exit", exitListener);

  child.once("exit", cleanup);
  return cleanup;
}
