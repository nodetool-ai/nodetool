#!/usr/bin/env node

/**
 * Preflight for the dev launchers: find processes that hold the dev ports and
 * offer to kill them.
 *
 * Usage:
 *   node scripts/dev-ports.mjs api web          # npm run dev
 *   node scripts/dev-ports.mjs --strict api web # electron:dev (no reuse)
 *
 * `api` is the backend port (PORT, default 7777). `web` is the Vite port
 * (3000, pinned with --strictPort in web/package.json). Without a TTY the
 * script only reports the holders. A busy `api` port is reusable unless
 * --strict is given, because `npm run dev` works against a running backend.
 * A busy `web` port always fails, because Vite cannot start on it.
 */

import { execFileSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const TARGETS = {
  api: () => ({ label: "backend", port: Number(process.env.PORT ?? 7777), reusable: true }),
  web: () => ({ label: "Vite dev server", port: 3000, reusable: false })
};

const KILL_TIMEOUT_MS = 5000;
const POLL_MS = 100;

export function findListenerPids(port, platform = process.platform) {
  try {
    if (platform === "win32") {
      const out = execFileSync("netstat", ["-ano", "-p", "TCP"], { encoding: "utf8" });
      const pids = new Set();
      for (const line of out.split(/\r?\n/)) {
        const cols = line.trim().split(/\s+/);
        if (cols[3] === "LISTENING" && cols[1]?.endsWith(`:${port}`)) {
          const pid = Number(cols[4]);
          if (Number.isInteger(pid) && pid > 0) {
            pids.add(pid);
          }
        }
      }
      return [...pids];
    }
    const out = execFileSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return [...new Set(out.split(/\s+/).filter(Boolean).map(Number))].filter(
      (pid) => Number.isInteger(pid) && pid > 0
    );
  } catch {
    // lsof exits non-zero when nothing listens.
    return [];
  }
}

function describePid(pid, platform = process.platform) {
  try {
    if (platform === "win32") {
      const out = execFileSync("tasklist", ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"], {
        encoding: "utf8"
      });
      return out.split(",")[0]?.replaceAll('"', "").trim() || "unknown";
    }
    const command = execFileSync("ps", ["-p", String(pid), "-o", "command="], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    }).trim();
    return command.length > 120 ? `${command.slice(0, 117)}...` : command || "unknown";
  } catch {
    return "unknown";
  }
}

function signal(pid, force, platform) {
  try {
    if (platform === "win32") {
      execFileSync("taskkill", ["/F", "/T", "/PID", String(pid)], { stdio: "ignore" });
    } else {
      process.kill(pid, force ? "SIGKILL" : "SIGTERM");
    }
  } catch {
    // Process already exited.
  }
}

async function freePort(port, pids, platform) {
  for (const pid of pids) {
    signal(pid, false, platform);
  }
  const deadline = Date.now() + KILL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (findListenerPids(port, platform).length === 0) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_MS));
  }
  for (const pid of findListenerPids(port, platform)) {
    signal(pid, true, platform);
  }
  await new Promise((resolve) => setTimeout(resolve, 500));
  return findListenerPids(port, platform).length === 0;
}

async function askYesNo(question) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(question);
    return /^y(es)?$/i.test(answer.trim());
  } finally {
    rl.close();
  }
}

/**
 * Returns true when every target port is free or reusable. Returns false when
 * the launcher must stop.
 */
export async function ensurePortsFree(
  targets,
  {
    strict = false,
    interactive = Boolean(process.stdin.isTTY),
    platform = process.platform,
    confirm = askYesNo
  } = {}
) {
  let ok = true;
  for (const { label, port, reusable } of targets) {
    const pids = findListenerPids(port, platform);
    if (pids.length === 0) {
      continue;
    }
    const canReuse = reusable && !strict;
    console.log(`\nPort ${port} (${label}) is in use:`);
    for (const pid of pids) {
      console.log(`  PID ${pid}: ${describePid(pid, platform)}`);
    }

    if (!interactive) {
      if (canReuse) {
        console.log(`  Reusing the existing ${label}.`);
      } else {
        console.log(`  Stop it first: kill ${pids.join(" ")}`);
        ok = false;
      }
      continue;
    }

    const fallback = canReuse ? `reuse the existing ${label}` : "abort";
    if (await confirm(`Kill ${pids.length === 1 ? "it" : "them"}? [y/N] (N = ${fallback}) `)) {
      if (await freePort(port, pids, platform)) {
        console.log(`  Port ${port} is free.`);
      } else {
        console.log(`  Port ${port} is still in use.`);
        ok = false;
      }
    } else if (!canReuse) {
      ok = false;
    }
  }
  return ok;
}

export function resolveTargets(names) {
  return names.map((name) => {
    const target = TARGETS[name];
    if (!target) {
      throw new Error(`Unknown target: ${name}. Use: ${Object.keys(TARGETS).join(", ")}`);
    }
    return target();
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const strict = args.includes("--strict");
  const targets = resolveTargets(args.filter((arg) => arg !== "--strict"));
  process.exit((await ensurePortsFree(targets, { strict })) ? 0 : 1);
}
