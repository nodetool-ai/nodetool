import fs from "./fs.mjs";
import fsPromises from "./fs-promises.mjs";
import os from "./os.mjs";
import path from "./path.mjs";
import url from "./url.mjs";

// A virtual process for sandboxed libraries. Platform and arch describe the
// runner binary, cwd is the virtual root, and env is guest-local. Host process
// control and host environment variables are never exposed.
// nextTick batches callbacks in one microtask, after already queued promises.

// Every own and inherited member name of Node's process object, so that a
// member the guest lacks fails with its name instead of reading undefined.
const NODE_MEMBERS = [
  "_debugEnd", "_debugProcess", "_events", "_eventsCount", "_exiting", "_fatalException",
  "_getActiveHandles", "_getActiveRequests", "_kill", "_linkedBinding", "_maxListeners",
  "_preload_modules", "_rawDebug", "_startProfilerIdleNotifier", "_stopProfilerIdleNotifier",
  "_tickCallback", "abort", "addListener", "allowedNodeEnvironmentFlags", "assert",
  "availableMemory", "binding", "channel", "chdir", "config", "connected", "constrainedMemory",
  "cpuUsage", "cwd", "debugPort", "disconnect", "dlopen", "emit", "eventNames", "execPath",
  "execve", "exit", "exitCode", "features", "finalization", "getActiveResourcesInfo",
  "getBuiltinModule", "getMaxListeners", "getegid", "geteuid", "getgid", "getgroups",
  "getuid", "hasUncaughtExceptionCaptureCallback", "hrtime", "initgroups", "kill",
  "listenerCount", "listeners", "loadEnvFile", "mainModule", "memoryUsage", "moduleLoadList",
  "off", "on", "once", "openStdin", "permission", "pid", "ppid", "prependListener",
  "prependOnceListener", "rawListeners", "reallyExit", "ref", "release", "removeAllListeners",
  "removeListener", "report", "resourceUsage", "send", "setMaxListeners", "setSourceMapsEnabled",
  "setUncaughtExceptionCaptureCallback", "setegid", "seteuid", "setgid", "setgroups", "setuid",
  "sourceMapsEnabled", "stderr", "stdin", "stdout", "threadCpuUsage", "throwDeprecation",
  "title", "traceDeprecation", "umask", "unref", "uptime"
];

function capability() {
  return globalThis.__host?.process;
}

function fact(name) {
  const value = capability()?.[name];
  if (typeof value !== "string") {
    throw new Error(`guest: process.${name} is unavailable in the native runner (no process capability)`);
  }
  return value;
}

let ticks = [];
let draining = false;

function runTicks() {
  // Ticks queued by a running tick join this batch, as in Node.
  for (let i = 0; i < ticks.length; i++) {
    const [callback, args] = ticks[i];
    try {
      callback(...args);
    } catch (err) {
      console.error(`uncaught exception in process.nextTick callback: ${err?.stack ?? err}`);
    }
  }
  ticks = [];
  draining = false;
}

export function nextTick(callback, ...args) {
  if (typeof callback !== "function") {
    const error = new TypeError(`The "callback" argument must be of type function. Received ${typeof callback}`);
    error.code = "ERR_INVALID_ARG_TYPE";
    throw error;
  }
  ticks.push([callback, args]);
  if (!draining) {
    draining = true;
    queueMicrotask(runTicks);
  }
}

export function emitWarning(warning, ...rest) {
  const text = warning instanceof Error ? `${warning.name}: ${warning.message}` : String(warning);
  const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type ?? "Warning";
  console.warn(`(guest) ${type === "Warning" ? "" : `${type}: `}${text}`);
}

// Nonprivileged virtual ownership for in-memory files, with no host access.
export function getuid() { return 1000; }
export function getgid() { return 1000; }

// A guest-local environment. Neither host environment nor secrets are copied.
export const env = Object.create(null);
export function cwd() { return "/"; }
export function resetProcessEnvironment() {
  for (const key of Object.keys(env)) delete env[key];
}
export function installProcess(target = globalThis) {
  Object.defineProperty(target, "process", {
    value: process, writable: true, configurable: true, enumerable: false
  });
}
// The guest is one thread with no CPU accounting, so CPU time is the
// monotonic clock since load: an upper bound callers can budget against.
const startedAt = globalThis.performance?.now?.() ?? Date.now();
const elapsedMs = () => (globalThis.performance?.now?.() ?? Date.now()) - startedAt;
export function cpuUsage(previous) {
  const user = Math.round(elapsedMs() * 1000);
  return previous ? { user: user - previous.user, system: 0 - previous.system } : { user, system: 0 };
}
export const threadCpuUsage = cpuUsage;
export function uptime() { return elapsedMs() / 1000; }
export function hrtime(previous) {
  const ns = BigInt(Math.round(elapsedMs() * 1e6));
  let seconds = Number(ns / 1000000000n);
  let nanos = Number(ns % 1000000000n);
  if (previous) {
    seconds -= previous[0];
    nanos -= previous[1];
    if (nanos < 0) { seconds -= 1; nanos += 1e9; }
  }
  return [seconds, nanos];
}
hrtime.bigint = () => BigInt(Math.round(elapsedMs() * 1e6));
export function memoryUsage() {
  return { rss: 0, heapTotal: 0, heapUsed: 0, external: 0, arrayBuffers: 0 };
}
memoryUsage.rss = () => 0;
// The guest's own builtins, which reach only what host capabilities grant.
// Other ids return undefined, as Node does for an unknown id.
const BUILTINS = { fs, "fs/promises": fsPromises, os, path, url };
export function getBuiltinModule(id) {
  return BUILTINS[String(id).replace(/^node:/, "")];
}
export const argv = [];
export const execArgv = [];
export const versions = {};
export const version = "";

const own = {
  cwd,
  getuid,
  getgid,
  env,
  argv,
  execArgv,
  versions,
  version,
  nextTick,
  emitWarning,
  cpuUsage,
  threadCpuUsage,
  uptime,
  hrtime,
  memoryUsage,
  getBuiltinModule,
  get platform() {
    return fact("platform");
  },
  get arch() {
    return fact("arch");
  },
  get [Symbol.toStringTag]() {
    return "process";
  }
};

const unavailable = new Set(NODE_MEMBERS);

const process = new Proxy(own, {
  get(target, key, receiver) {
    if (typeof key !== "string" || key in target) return Reflect.get(target, key, receiver);
    if (unavailable.has(key)) {
      throw new Error(`guest: process.${key} is unavailable in the native runner`);
    }
    return undefined;
  },
  has(target, key) {
    return key in target;
  }
});

export const platform = typeof capability()?.platform === "string" ? capability().platform : undefined;
export const arch = typeof capability()?.arch === "string" ? capability().arch : undefined;

export default process;
