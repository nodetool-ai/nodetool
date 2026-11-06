// Safety rules for scripts that start scratch NodeTool servers
// (server-check.mjs). Tested by scratch-safety.test.mjs.
//
//  - The scratch folder is fresh per run (mkdtemp) under a build folder whose
//    canonical location is checked first, and every delete re-checks that its
//    target resolves inside that folder. A symlink is unlinked, never followed.
//  - A port must be free before a launch, and every listener on it must be in
//    the process group (POSIX) or Job Object (Windows) started here before any write.
//  - Requests refuse redirects, so none can reach another server (7777).
//  - Each scratch server proves fresh nonces with HMAC before a write on
//    that connection. The instance secret never goes over the wire.
//  - POSIX cleanup stops process groups: SIGTERM, then SIGKILL after a deadline.
//    Windows jobs kill descendants on cleanup, helper death, or owner death.

import { spawn, spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const windowsGroups = new Map();
function jobHelper() {
  const helper = process.env.NT_SCRATCH_JOB_HELPER;
  if (!helper || !fs.existsSync(helper)) throw new Error("Windows scratch requires NT_SCRATCH_JOB_HELPER from the native build");
  return helper;
}
function jobCommand(command, name, ...args) {
  const r = spawnSync(jobHelper(), [command, name, ...args.map(String)], { encoding: "utf8", windowsHide: true, timeout: 10000 });
  if (r.error || ![0, 1].includes(r.status)) throw new Error(`scratch job ${command}: ${r.error ?? r.stderr}`);
  return r.status === 0;
}
/** Windows children enter a kill-on-close job atomically before executing. */
export function spawnOwned(executable, args, options = {}) {
  if (process.platform !== "win32") return spawn(executable, args, options);
  const name = `Local\\NodeToolScratch-${crypto.randomUUID()}`;
  const child = spawn(jobHelper(), ["run", name, String(process.pid), executable, ...args], { ...options, detached: false, windowsHide: true });
  windowsGroups.set(child.pid, { name, child });
  return child;
}
export function killGroup(group) {
  if (process.platform === "win32") {
    const entry = windowsGroups.get(group);
    if (!entry) throw new Error(`unowned scratch group ${group}`);
    jobCommand("stop", entry.name);
    // Also closes a helper that has not created its job yet.
    entry.child.kill();
    return;
  }
  try { process.kill(-group, "SIGKILL"); } catch { /* gone */ }
}

/** `<parent>/<name>` when it is a plain directory at its canonical path; created if absent. */
export function verifiedBuildDir(parent, name) {
  const dir = path.join(parent, name);
  fs.mkdirSync(dir, { recursive: true });
  const st = fs.lstatSync(dir);
  if (st.isSymbolicLink() || !st.isDirectory()) throw new Error(`${dir} is not a plain directory`);
  const real = fs.realpathSync(dir);
  const expected = path.join(fs.realpathSync(parent), name);
  if (real !== expected) throw new Error(`${dir} resolves to ${real}, not ${expected}`);
  return real;
}

/** A fresh, uniquely named folder under a verified build folder. */
export function makeScratch(buildDir, prefix = "scratch-") {
  return fs.mkdtempSync(path.join(buildDir, prefix));
}

/** Throws unless `p` is `work` or inside it once symlinks are resolved. Returns the absolute path. */
export function assertInWork(work, p) {
  const abs = path.resolve(p);
  if (abs !== work && !abs.startsWith(work + path.sep)) throw new Error(`${abs} is outside ${work}`);
  let probe = abs;
  while (!fs.existsSync(probe) && probe !== work) probe = path.dirname(probe);
  const real = fs.realpathSync(probe);
  if (real !== work && !real.startsWith(work + path.sep)) throw new Error(`${abs} resolves to ${real}, outside ${work}`);
  return abs;
}

/** Deletes `p` inside `work`. A symlink is unlinked, not followed. */
export function safeRm(work, p) {
  const abs = path.resolve(p);
  if (!abs.startsWith(work + path.sep)) throw new Error(`${abs} is outside ${work}`);
  let st;
  try {
    st = fs.lstatSync(abs);
  } catch {
    return;
  }
  if (st.isSymbolicLink()) {
    assertInWork(work, path.dirname(abs));
    fs.unlinkSync(abs);
    return;
  }
  assertInWork(work, abs);
  fs.rmSync(abs, { recursive: true, force: true });
}

/** Listener PIDs from the Windows TCP table, lsof, or Linux ss. */
export function listenerPids(port) {
  if (process.platform === "win32") {
    const r = spawnSync(jobHelper(), ["listeners", String(port)], { encoding: "utf8", windowsHide: true, timeout: 10000 });
    if (r.error || r.status !== 0) throw new Error(`cannot enumerate TCP listeners: ${r.error ?? r.stderr}`);
    const lines = r.stdout.trim() ? r.stdout.trim().split(/\r?\n/) : [];
    if (lines.some(line => !/^[1-9][0-9]*$/.test(line))) throw new Error("invalid TCP listener PID");
    return [...new Set(lines.map(Number))];
  }
  const r = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], { encoding: "utf8" });
  if (r.error?.code === "ENOENT" && process.platform === "linux") {
    const ss = spawnSync("ss", ["-H", "-ltnp", `sport = :${port}`], { encoding: "utf8" });
    return [...new Set([...(ss.stdout ?? "").matchAll(/pid=(\d+)/g)].map((m) => Number(m[1])))];
  }
  return (r.stdout ?? "").split("\n").map((l) => Number(l.trim())).filter((n) => n > 0);
}

export function processGroupOf(pid) {
  const r = spawnSync("ps", ["-o", "pgid=", "-p", String(pid)], { encoding: "utf8" });
  return Number((r.stdout ?? "").trim());
}

/** True when the port has a listener and every listener is in process group `pgid`. */
export function groupOwnsPort(pgid, port) {
  const pids = listenerPids(port);
  if (process.platform === "win32") {
    const entry = windowsGroups.get(pgid);
    return !!entry && pids.length > 0 && pids.every(pid => jobCommand("contains", entry.name, pid));
  }
  return pids.length > 0 && pids.every((pid) => processGroupOf(pid) === pgid);
}

/** fetch that refuses redirects. */
export async function noRedirectFetch(url, init = {}) {
  const r = await fetch(url, { ...init, redirect: "manual" });
  if (r.status >= 300 && r.status < 400) {
    throw new Error(`refusing a redirect from ${url} to ${r.headers.get("location")}`);
  }
  return r;
}

export const INSTANCE_ENV = "NT_SCRATCH_INSTANCE";
export const INSTANCE_HEADER = "x-nodetool-instance";
export const NONCE_HEADER = "x-nodetool-instance-nonce";
export const PROOF_HEADER = "x-nodetool-instance-proof";
/** The native client's variable for the token it requires (ServerSource.h). */
export const NATIVE_EXPECT_ENV = "NODETOOL_TIMELINE_EXPECT_INSTANCE";

/** Preloads nonce proofs into scratch HTTP servers without disclosing the secret. */
export function instancePreloadOption() {
  const code = [
    'import http from "node:http";',
    'import crypto from "node:crypto";',
    `const token = process.env.${INSTANCE_ENV};`,
    "if (token) {",
    "  const writeHead = http.ServerResponse.prototype.writeHead;",
    "  http.ServerResponse.prototype.writeHead = function (...args) {",
    `    const nonce = this.req?.headers["${NONCE_HEADER}"];`,
    "    if (!this.headersSent && typeof nonce === 'string' && /^[0-9a-f]{32,128}$/.test(nonce)) {",
    `      this.setHeader("${PROOF_HEADER}", crypto.createHmac("sha256", token).update(nonce).digest("hex"));`,
    "    }",
    "    return writeHead.apply(this, args);",
    "  };",
    "}"
  ].join("\n");
  return `--import=data:text/javascript,${encodeURIComponent(code)}`;
}

export function groupAlive(pgid) {
  if (process.platform === "win32") {
    const entry = windowsGroups.get(pgid);
    return !!entry && jobCommand("alive", entry.name);
  }
  try {
    process.kill(-pgid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Stops process groups: SIGTERM, wait up to `termMs`, SIGKILL the rest, wait
 * up to `killMs`. Throws when a group is still alive after that.
 */
export async function stopGroups(groups, { termMs = 15_000, killMs = 5_000 } = {}) {
  if (process.platform === "win32") {
    for (const g of groups) killGroup(g);
    const deadline = Date.now() + killMs;
    while (groups.some(groupAlive) && Date.now() < deadline) await sleep(50);
    if (groups.some(groupAlive)) throw new Error("scratch job descendants survived termination");
    return;
  }
  for (const g of groups) {
    try {
      process.kill(-g, "SIGTERM");
    } catch {
      /* gone */
    }
  }
  const end = Date.now() + termMs;
  while (groups.some(groupAlive) && Date.now() < end) await sleep(100);
  for (const g of groups.filter(groupAlive)) {
    try {
      process.kill(-g, "SIGKILL");
    } catch {
      /* gone */
    }
  }
  const killEnd = Date.now() + killMs;
  while (groups.some(groupAlive) && Date.now() < killEnd) await sleep(50);
  const left = groups.filter(groupAlive);
  if (left.length > 0) throw new Error(`process groups still alive after SIGKILL: ${left.join(", ")}`);
}
