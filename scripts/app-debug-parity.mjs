#!/usr/bin/env node
/**
 * Parity capture for the app-debug relocation (implementation plan PR 3).
 *
 * Runs `nodetool app debug --json` over every shipped example app bundle and
 * writes a normalized report per bundle, so a before/after diff proves the
 * relocation changed no output. Timestamps, bundle paths, and durations are
 * scrubbed — everything else must match byte for byte.
 *
 *   node scripts/app-debug-parity.mjs before
 *   node scripts/app-debug-parity.mjs after
 *   diff -ru /tmp/app-debug-parity/before /tmp/app-debug-parity/after
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const appsDir = join(root, "packages/base-nodes/nodetool/examples/apps");
const label = process.argv[2];
if (!label) {
  console.error("usage: node scripts/app-debug-parity.mjs <before|after>");
  process.exit(2);
}
const outDir = join("/tmp/app-debug-parity", label);

/** Scrub anything that legitimately differs between two runs. */
const normalize = (value) => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, inner] of Object.entries(value)) {
      if (key === "generatedAt" || key === "bundleDir" || key === "ref") {
        out[key] = "<normalized>";
      } else if (key === "durationMs" || key === "startedAt" || key === "endedAt") {
        out[key] = 0;
      } else {
        out[key] = normalize(inner);
      }
    }
    return out;
  }
  return value;
};

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const bundles = (await readdir(appsDir)).filter((f) => f.endsWith(".json")).sort();
for (const bundle of bundles) {
  for (const mode of ["static", "run"]) {
    const bundleOut = join("/tmp/app-debug-parity", `${label}-bundle`, mode, bundle);
    let stdout = "";
    let failure = null;
    try {
      ({ stdout } = await run(
        "npx",
        [
          "tsx",
          "packages/cli/src/nodetool.ts",
          "app",
          "debug",
          join(appsDir, bundle),
          "--json",
          ...(mode === "static" ? ["--no-run"] : []),
          "--out",
          bundleOut
        ],
        {
          cwd: root,
          maxBuffer: 64 * 1024 * 1024,
          env: {
            ...process.env,
            NODE_OPTIONS: "--conditions=nodetool-dev",
            // A throwaway data dir keeps the run off the developer's database.
            XDG_DATA_HOME: "/tmp/app-debug-parity/data"
          }
        }
      ));
    } catch (error) {
      // `app debug` exits non-zero when the verdict fails; the report still
      // printed, and a failing verdict must match before and after too.
      stdout = error.stdout ?? "";
      failure = error.stderr ?? String(error);
    }
    const start = stdout.indexOf("{");
    if (start < 0) {
      await writeFile(
        join(outDir, `${mode}-${bundle}.txt`),
        failure ?? "no JSON on stdout",
        "utf8"
      );
      console.log(`${mode} ${bundle}: no report`);
      continue;
    }
    const report = normalize(JSON.parse(stdout.slice(start)));
    await writeFile(
      join(outDir, `${mode}-${bundle}`),
      JSON.stringify(report, null, 2) + "\n",
      "utf8"
    );
    console.log(`${mode} ${bundle}: verdict ${report.verdict?.ok ? "ok" : "fail"}`);
  }
}
console.log(`wrote ${outDir}`);
