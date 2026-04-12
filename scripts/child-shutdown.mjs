import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

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
    process.kill(-pid, "SIGTERM");
  } catch {
    // Child already exited.
  }
}

export function registerChildShutdownHandlers({
  child,
  processLike = process,
  platform = process.platform,
  killTree = (pid) => killProcessTree(pid, platform)
}) {
  if (platform !== "win32" || !child?.pid) {
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

  for (const signal of ["SIGINT", "SIGTERM", "SIGBREAK"]) {
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

export function getTsxWatchCommand(repoRoot, entrypoint) {
  return {
    command: process.execPath,
    args: [resolve(repoRoot, "node_modules", "tsx", "dist", "cli.mjs"), "--watch", entrypoint]
  };
}
