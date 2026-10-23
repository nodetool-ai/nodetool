import { spawn, spawnSync } from "node:child_process";

export function runReleaseCommand(command, args, options) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 300_000, ...options });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout;
}

/** Like spawnSync, but leaves the event loop free so registry calls can overlap. */
export function spawnCapture(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { timeout: 300_000, ...options, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8").on("data", chunk => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", status => resolvePromise({ status, stdout, stderr }));
  });
}

export async function runReleaseCommandAsync(command, args, options) {
  const result = await spawnCapture(command, args, options);
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} exited ${result.status}\n${result.stdout}${result.stderr}`);
  }
  return result.stdout;
}

/** Run at most `limit` of the returned function's tasks at once. */
export function createLimiter(limit) {
  let active = 0;
  const waiting = [];
  const next = () => {
    if (active >= limit || waiting.length === 0) { return; }
    active++;
    const { task, resolveTask, rejectTask } = waiting.shift();
    Promise.resolve().then(task).then(resolveTask, rejectTask).finally(() => { active--; next(); });
  };
  return task => new Promise((resolveTask, rejectTask) => {
    waiting.push({ task, resolveTask, rejectTask });
    next();
  });
}

/** Log how long one release phase took, so slow phases show up in CI logs. */
export async function timed(label, task) {
  const started = Date.now();
  try {
    return await task();
  } finally {
    console.log(`[time] ${label}: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  }
}
