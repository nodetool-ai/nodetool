#!/usr/bin/env node
/**
 * classify.ts — one-shot import scanner for base-nodes.
 *
 * Walks every `src/nodes/*.ts` file, follows local relative imports
 * transitively, and matches every external import against a hardcoded
 * list of native / runtime-restricted patterns. Emits a per-module
 * classification:
 *
 *   - "node, workers, edge"  — no native imports, fully portable
 *   - "node, workers"        — uses node:fs (writes go through async shim)
 *   - "node"                 — native module, subprocess, or sync fs
 *
 * Run with: npm run dev:nodetool -- script base-nodes/scripts/classify.ts
 * Or directly: tsx packages/base-nodes/scripts/classify.ts
 *
 * Output: prints a table to stdout, plus a JSON report at
 * /tmp/base-nodes-classification.json for follow-up tooling.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = resolve(HERE, "..", "src", "nodes");
const SRC_DIR = resolve(HERE, "..", "src");

type Platform = "node" | "workers" | "edge";

interface NativeMatcher {
  /** Regex match against a `from "<spec>"` import specifier. */
  pattern: RegExp;
  /** Human-readable reason this disqualifies the module. */
  reason: string;
  /** Strictest platform the module can still target with this dep. */
  maxPlatforms: readonly Platform[];
}

/**
 * Patterns that force a module to a more restrictive platform set.
 * Order matters only for the "reason" string — first match wins per import.
 *
 * Defaults: ["node", "workers", "edge"] for a module with no matches.
 */
const NATIVE_MATCHERS: NativeMatcher[] = [
  // Hard native bindings — Node only.
  { pattern: /^sharp$/, reason: "sharp (libvips native)", maxPlatforms: ["node"] },
  { pattern: /^better-sqlite3$/, reason: "better-sqlite3 (native)", maxPlatforms: ["node"] },
  { pattern: /^@napi-rs\/canvas$/, reason: "@napi-rs/canvas (native)", maxPlatforms: ["node"] },
  { pattern: /^canvas$/, reason: "canvas (native cairo)", maxPlatforms: ["node"] },
  { pattern: /^@hyzyla\/pdfium/, reason: "pdfium (native)", maxPlatforms: ["node"] },
  { pattern: /^@tensorflow\/tfjs-node/, reason: "@tensorflow/tfjs-node (native)", maxPlatforms: ["node"] },
  { pattern: /^onnxruntime-node$/, reason: "onnxruntime-node (native)", maxPlatforms: ["node"] },
  { pattern: /^node-pty/, reason: "node-pty (native)", maxPlatforms: ["node"] },
  { pattern: /^fsevents/, reason: "fsevents (native)", maxPlatforms: ["node"] },
  { pattern: /^bufferutil/, reason: "bufferutil (native)", maxPlatforms: ["node"] },
  { pattern: /^keytar/, reason: "keytar (native)", maxPlatforms: ["node"] },
  { pattern: /^sqlite-vec/, reason: "sqlite-vec (native)", maxPlatforms: ["node"] },

  // Subprocess / server-shaped — Node only.
  { pattern: /^node:child_process$|^child_process$/, reason: "child_process (subprocess)", maxPlatforms: ["node"] },
  { pattern: /^node:worker_threads$|^worker_threads$/, reason: "worker_threads", maxPlatforms: ["node"] },
  { pattern: /^node:net$|^node:dgram$|^node:dns$|^node:tls$/, reason: "raw socket / dns API", maxPlatforms: ["node"] },
  { pattern: /^node:os$/, reason: "node:os", maxPlatforms: ["node"] },
  { pattern: /^node:cluster$/, reason: "node:cluster", maxPlatforms: ["node"] },

  // Browser-control / OS automation.
  { pattern: /^chrome-launcher$/, reason: "chrome-launcher (spawns Chrome)", maxPlatforms: ["node"] },
  { pattern: /^chrome-remote-interface$/, reason: "chrome-remote-interface", maxPlatforms: ["node"] },
  { pattern: /^puppeteer/, reason: "puppeteer", maxPlatforms: ["node"] },
  { pattern: /^playwright/, reason: "playwright", maxPlatforms: ["node"] },
  { pattern: /^dockerode$/, reason: "dockerode (Docker socket)", maxPlatforms: ["node"] },

  // Mail / IMAP / SMTP — uses raw sockets via Node.
  { pattern: /^nodemailer$/, reason: "nodemailer (SMTP)", maxPlatforms: ["node"] },
  { pattern: /^imapflow$/, reason: "imapflow (IMAP)", maxPlatforms: ["node"] },
  { pattern: /^mailparser$/, reason: "mailparser", maxPlatforms: ["node"] },

  // Sync fs — Node only.
  { pattern: /^node:fs$|^fs$/, reason: "node:fs (sync FS)", maxPlatforms: ["node"] },

  // Async fs/promises — Workers compat polyfills it (limited).
  { pattern: /^node:fs\/promises$|^fs\/promises$/, reason: "node:fs/promises", maxPlatforms: ["node", "workers"] },

  // tesseract.js — has both native (Node) and WASM builds; conservative.
  { pattern: /^tesseract\.js-node$/, reason: "tesseract.js-node (native)", maxPlatforms: ["node"] },
];

interface ModuleReport {
  file: string;
  platforms: readonly Platform[];
  reasons: string[];
  importedFiles: string[];
}

const IMPORT_RE = /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

function readImports(file: string): string[] {
  const content = readFileSync(file, "utf-8");
  const out = new Set<string>();
  for (const m of content.matchAll(IMPORT_RE)) out.add(m[1]);
  for (const m of content.matchAll(DYNAMIC_IMPORT_RE)) out.add(m[1]);
  return [...out];
}

function isRelative(spec: string): boolean {
  return spec.startsWith(".") || spec.startsWith("/");
}

function resolveRelative(fromFile: string, spec: string): string | null {
  const stripped = spec.replace(/\.(?:js|ts)$/, "");
  const base = resolve(dirname(fromFile), stripped);
  const candidates = [
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    join(base, "index.ts"),
    join(base, "index.tsx"),
    join(base, "index.js")
  ];
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* not found */
    }
  }
  return null;
}

function intersect(
  a: readonly Platform[],
  b: readonly Platform[]
): readonly Platform[] {
  return a.filter((p) => b.includes(p));
}

/**
 * Classify a single entry file by walking its local import graph,
 * collecting every external import along the way, and applying matchers.
 */
function classifyFile(entry: string): ModuleReport {
  const visited = new Set<string>();
  const externals = new Set<string>();
  const stack: string[] = [entry];

  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    let imports: string[];
    try {
      imports = readImports(file);
    } catch {
      continue;
    }

    for (const spec of imports) {
      if (isRelative(spec)) {
        const target = resolveRelative(file, spec);
        if (target && !visited.has(target)) stack.push(target);
      } else {
        externals.add(spec);
      }
    }
  }

  let platforms: readonly Platform[] = ["node", "workers", "edge"];
  const reasons: string[] = [];
  for (const ext of externals) {
    for (const m of NATIVE_MATCHERS) {
      if (m.pattern.test(ext)) {
        const before = platforms.length;
        platforms = intersect(platforms, m.maxPlatforms);
        if (platforms.length !== before) {
          reasons.push(`${ext} → ${m.reason}`);
        }
        break;
      }
    }
  }

  return {
    file: entry.replace(`${SRC_DIR}/`, ""),
    platforms,
    reasons: [...new Set(reasons)].sort(),
    importedFiles: [...visited].map((f) => f.replace(`${SRC_DIR}/`, ""))
  };
}

function main(): void {
  const entries = readdirSync(NODES_DIR)
    .filter((f) => extname(f) === ".ts" && !f.endsWith(".d.ts"))
    .map((f) => join(NODES_DIR, f))
    .sort();

  const reports = entries.map(classifyFile);

  const portable = reports.filter((r) => r.platforms.length === 3);
  const workersOnly = reports.filter(
    (r) => r.platforms.length === 2 && r.platforms.includes("workers")
  );
  const nodeOnly = reports.filter(
    (r) => r.platforms.length === 1 && r.platforms[0] === "node"
  );
  const other = reports.filter(
    (r) =>
      !portable.includes(r) &&
      !workersOnly.includes(r) &&
      !nodeOnly.includes(r)
  );

  const fmt = (rs: ModuleReport[]): string =>
    rs.map((r) => `  ${r.file}`).join("\n");

  console.log(
    `\n=== PORTABLE (node, workers, edge) — ${portable.length} files ===`
  );
  console.log(fmt(portable));
  console.log(
    `\n=== WORKERS+NODE (uses node:fs/promises only) — ${workersOnly.length} files ===`
  );
  console.log(fmt(workersOnly));
  if (other.length > 0) {
    console.log(`\n=== OTHER — ${other.length} files ===`);
    console.log(fmt(other));
  }
  console.log(`\n=== NODE ONLY — ${nodeOnly.length} files ===`);
  for (const r of nodeOnly) {
    console.log(`  ${r.file}`);
    for (const reason of r.reasons) {
      console.log(`    · ${reason}`);
    }
  }

  console.log(
    `\nSummary: ${portable.length} portable · ${workersOnly.length} workers+node · ${nodeOnly.length} node-only · ${other.length} other (total ${reports.length})`
  );

  const outPath = "/tmp/base-nodes-classification.json";
  writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main();
