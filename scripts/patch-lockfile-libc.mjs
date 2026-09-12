#!/usr/bin/env node
// Records the `libc` field of platform-specific packages in package-lock.json.
//
// npm picks optional platform packages by matching the `os`, `cpu` and `libc`
// fields it finds *in the lockfile*. npm 10 resolves `libc` from the registry
// manifest but never writes it to the lock, so every musl build of every
// prebuilt native package looks installable to `npm ci` on a glibc host:
// `npm install` skips them, `npm ci` does not. That is the install CI, Docker
// and every fresh clone run, and on this tree it reifies ~490 MB of musl
// binaries that no glibc host can load (@anthropic-ai/claude-agent-sdk at
// 220 MB, @next/swc at 91 MB, @rspack/binding at 61 MB, and ten more).
//
// npm 11 writes `libc` itself, but regenerating this lock from scratch is not
// a drop-in: the resolver hits a real react/@react-three/fiber peer conflict,
// and regenerating in place against an installed tree silently drops the
// mac/win entries that macOS and Windows contributors install from. So this
// backfills the one missing field onto the existing resolutions instead,
// reading each value from the registry manifest that npm itself would consult.
// Both npm 10 and npm 11 then filter correctly.
//
// Usage:
//   node scripts/patch-lockfile-libc.mjs           # write the field, from the registry
//   node scripts/patch-lockfile-libc.mjs --check    # offline guard, no registry
//
// Run it after any `npm install` that rewrites the lock under npm 10, which
// strips the field again. `npm run check:lockfile-libc` enforces that. The
// write path reads the registry so the values are authoritative; `--check`
// stays offline and deterministic, because it only has to catch the one
// regression that matters — a musl build that lost its `libc` and so became
// installable again on glibc.

import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const registry = process.env.npm_config_registry ?? "https://registry.npmjs.org";

// Both real lockfiles in the repo. `mobile/` is deliberately not a root
// workspace and carries its own lock, with the same npm 10 gap.
const LOCKFILES = [
  [join(repoRoot, "package-lock.json"), "package-lock.json"],
  [join(repoRoot, "mobile", "package-lock.json"), "mobile/package-lock.json"]
];

/** Package name for a lockfile path key, which may be workspace-nested. */
export function packageName(key) {
  const marker = key.lastIndexOf("node_modules/");
  return marker === -1 ? null : key.slice(marker + "node_modules/".length);
}

/**
 * Entries whose package may declare `libc`. The field only constrains Linux
 * builds, so non-Linux entries are left alone; `link` entries are workspace
 * symlinks with no registry manifest to read.
 */
export function candidates(packages) {
  return Object.entries(packages)
    .filter(([key, entry]) => {
      if (!key || entry.link) return false;
      if (!entry.resolved || !entry.version) return false;
      return Array.isArray(entry.os) && entry.os.includes("linux");
    })
    .map(([key, entry]) => ({ key, entry, name: packageName(key) }))
    .filter((candidate) => candidate.name !== null);
}

/** Read the authoritative `libc` for one resolution from the registry. */
async function fetchLibc(name, version) {
  const url = `${registry.replace(/\/$/, "")}/${name.replace("/", "%2f")}/${version}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${name}@${version}: registry returned ${response.status}`);
  }
  const manifest = await response.json();
  return Array.isArray(manifest.libc) ? manifest.libc : null;
}

/**
 * Reinsert `libc` where npm writes it, directly after `cpu`, so a later npm 11
 * install produces no diff. Every package that declares `libc` is a prebuilt
 * binary and declares `cpu` too; `integrity` is the fallback anchor.
 */
export function withLibc(entry, libc) {
  const anchor = "cpu" in entry ? "cpu" : "integrity";
  const patched = {};
  for (const [key, value] of Object.entries(entry)) {
    patched[key] = value;
    if (key === anchor) patched.libc = libc;
  }
  if (!(anchor in entry)) patched.libc = libc;
  return patched;
}

/** Resolve `libc` for every candidate, a few requests at a time. */
async function resolveAll(list, concurrency = 12) {
  const results = new Map();
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, list.length) }, async () => {
    while (cursor < list.length) {
      const item = list[cursor++];
      results.set(item.key, await fetchLibc(item.name, item.entry.version));
    }
  });
  await Promise.all(workers);
  return results;
}

// Architectures this repo installs on: CI, the Docker image and contributor
// machines are all x64 or arm64. A musl build for any other cpu is filtered by
// `cpu` alone, so a missing `libc` there costs nothing — which matters because
// a few upstreams (@oxlint, @oxc-parser and @oxc-resolver, all at
// linux-arm-musleabihf) ship musl builds that declare no `libc` at all.
const INSTALLABLE_ARCHES = ["x64", "arm64"];

/**
 * Offline guard: every musl build that could land on one of our architectures
 * must carry `libc`, or npm will reify it onto glibc hosts again. Name-matching
 * is enough here because the packages this protects against all encode the ABI
 * in their name, and the write path above is what establishes the values.
 */
export function checkOffline(list, label = "package-lock.json") {
  const muslEntries = list.filter(
    ({ name, entry }) =>
      /-musl(eabihf)?$/.test(name) &&
      (!Array.isArray(entry.cpu) || entry.cpu.some((arch) => INSTALLABLE_ARCHES.includes(arch)))
  );
  if (muslEntries.length === 0) {
    console.error(`${label}: no musl entries found — the guard inspected nothing.`);
    return 1;
  }
  const missing = muslEntries.filter(({ entry }) => !Array.isArray(entry.libc) || !entry.libc.includes("musl"));
  console.log(`${label}: checked ${muslEntries.length} musl entries.`);
  if (missing.length === 0) {
    console.log(`${label}: every musl build records \`libc\`, so \`npm ci\` skips them on glibc hosts.`);
    return 0;
  }
  const noun = missing.length === 1 ? "musl entry is" : "musl entries are";
  console.error(`${label}: ${missing.length} ${noun} missing \`libc\` and would install on glibc:`);
  for (const { key } of missing.slice(0, 10)) console.error(`  ${key}`);
  if (missing.length > 10) console.error(`  …and ${missing.length - 10} more`);
  console.error("Run `npm run fix:lockfile-libc` and commit the lockfile.");
  return 1;
}

/** Backfill one lockfile from the registry. Returns the number of entries changed. */
async function patchLock(path, label) {
  const lock = JSON.parse(await readFile(path, "utf8"));
  const list = candidates(lock.packages);
  if (list.length === 0) {
    throw new Error(`${label}: no Linux platform entries — refusing to report success.`);
  }
  const resolved = await resolveAll(list);
  let changed = 0;
  for (const { key, entry } of list) {
    const libc = resolved.get(key);
    const current = Array.isArray(entry.libc) ? entry.libc : null;
    if (JSON.stringify(current) === JSON.stringify(libc)) continue;
    changed += 1;
    if (libc === null) {
      const { libc: _unset, ...rest } = entry;
      lock.packages[key] = rest;
    } else {
      lock.packages[key] = withLibc(entry, libc);
    }
  }
  console.log(`${label}: checked ${list.length} Linux platform entries.`);
  if (changed === 0) {
    console.log(`${label}: \`libc\` is already recorded for every entry that declares it.`);
    return 0;
  }
  await writeFile(path, `${JSON.stringify(lock, null, 2)}\n`);
  console.log(`${label}: recorded \`libc\` on ${changed} entries.`);
  return changed;
}

async function main() {
  const check = process.argv.includes("--check");
  let failed = 0;

  for (const [path, label] of LOCKFILES) {
    if (!check) {
      await patchLock(path, label);
      continue;
    }
    const lock = JSON.parse(await readFile(path, "utf8"));
    const list = candidates(lock.packages);
    if (list.length === 0) {
      console.error(`${label}: no Linux platform entries — refusing to report success.`);
      failed = 1;
      continue;
    }
    failed = checkOffline(list, label) || failed;
  }

  process.exitCode = failed;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await main();
}
