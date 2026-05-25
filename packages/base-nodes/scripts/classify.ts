#!/usr/bin/env node
/**
 * classify.ts — static import scanner for base-nodes.
 *
 * Walks every `src/nodes/*.ts` file, follows local relative imports
 * transitively, and matches every external **static** import against a
 * hardcoded list of native / runtime-restricted patterns. **Dynamic
 * imports** (`await import("sharp")`) do not demote the tag because the
 * module is loadable in any environment — the failure surfaces only at
 * the call site, which the node is expected to guard at runtime.
 *
 * Output buckets:
 *   - SERVER (node, workers, edge)  — no native imports, server-portable
 *   - WORKERS+NODE                   — uses node:fs/promises only
 *   - HYBRID (node, browser)         — claims browser via WebGPU markers
 *   - UNIVERSAL                      — server-portable AND claims browser
 *   - NODE ONLY                      — native modules, subprocess, sync fs
 *
 * Run with: tsx packages/base-nodes/scripts/classify.ts
 * Output: stdout table + JSON at /tmp/base-nodes-classification.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = resolve(HERE, "..", "src", "nodes");
const SRC_DIR = resolve(HERE, "..", "src");

type Platform = "node" | "workers" | "edge" | "browser";

const SERVER: readonly Platform[] = ["node", "workers", "edge"];
const NODE_AND_BROWSER: readonly Platform[] = ["node", "browser"];

interface NativeMatcher {
  /** Regex match against an import specifier. */
  pattern: RegExp;
  /** Human-readable reason this disqualifies the module. */
  reason: string;
  /** Strictest server platforms still supported with this dep. */
  maxServerPlatforms: readonly Platform[];
}

interface BrowserMatcher {
  pattern: RegExp;
  reason: string;
}

/**
 * Patterns that demote the server platform set (static imports only).
 * Defaults: SERVER = ["node", "workers", "edge"] for a module with no matches.
 */
const NATIVE_MATCHERS: NativeMatcher[] = [
  // Hard native bindings — Node only.
  { pattern: /^sharp$/, reason: "sharp (libvips native)", maxServerPlatforms: ["node"] },
  { pattern: /^better-sqlite3$/, reason: "better-sqlite3 (native)", maxServerPlatforms: ["node"] },
  { pattern: /^@napi-rs\/canvas$/, reason: "@napi-rs/canvas (native)", maxServerPlatforms: ["node"] },
  { pattern: /^canvas$/, reason: "canvas (native cairo)", maxServerPlatforms: ["node"] },
  { pattern: /^@hyzyla\/pdfium/, reason: "pdfium (native)", maxServerPlatforms: ["node"] },
  { pattern: /^@tensorflow\/tfjs-node/, reason: "@tensorflow/tfjs-node (native)", maxServerPlatforms: ["node"] },
  { pattern: /^onnxruntime-node$/, reason: "onnxruntime-node (native)", maxServerPlatforms: ["node"] },
  { pattern: /^node-pty/, reason: "node-pty (native)", maxServerPlatforms: ["node"] },
  { pattern: /^fsevents/, reason: "fsevents (native)", maxServerPlatforms: ["node"] },
  { pattern: /^bufferutil/, reason: "bufferutil (native)", maxServerPlatforms: ["node"] },
  { pattern: /^keytar/, reason: "keytar (native)", maxServerPlatforms: ["node"] },
  { pattern: /^sqlite-vec/, reason: "sqlite-vec (native)", maxServerPlatforms: ["node"] },

  // Subprocess / raw-socket — Node only.
  { pattern: /^node:child_process$|^child_process$/, reason: "child_process (subprocess)", maxServerPlatforms: ["node"] },
  { pattern: /^node:worker_threads$|^worker_threads$/, reason: "worker_threads", maxServerPlatforms: ["node"] },
  { pattern: /^node:net$|^node:dgram$|^node:dns$|^node:tls$/, reason: "raw socket / dns API", maxServerPlatforms: ["node"] },
  { pattern: /^node:os$/, reason: "node:os", maxServerPlatforms: ["node"] },
  { pattern: /^node:cluster$/, reason: "node:cluster", maxServerPlatforms: ["node"] },

  // Browser-control / OS automation — these AUTOMATE a browser; they don't run in one.
  { pattern: /^chrome-launcher$/, reason: "chrome-launcher (spawns Chrome)", maxServerPlatforms: ["node"] },
  { pattern: /^chrome-remote-interface$/, reason: "chrome-remote-interface", maxServerPlatforms: ["node"] },
  { pattern: /^puppeteer/, reason: "puppeteer", maxServerPlatforms: ["node"] },
  { pattern: /^playwright/, reason: "playwright", maxServerPlatforms: ["node"] },
  { pattern: /^dockerode$/, reason: "dockerode (Docker socket)", maxServerPlatforms: ["node"] },

  // Mail / IMAP / SMTP — raw sockets via Node.
  { pattern: /^nodemailer$/, reason: "nodemailer (SMTP)", maxServerPlatforms: ["node"] },
  { pattern: /^imapflow$/, reason: "imapflow (IMAP)", maxServerPlatforms: ["node"] },
  { pattern: /^mailparser$/, reason: "mailparser", maxServerPlatforms: ["node"] },

  // Sync fs — Node only.
  { pattern: /^node:fs$|^fs$/, reason: "node:fs (sync FS)", maxServerPlatforms: ["node"] },

  // Async fs/promises — Workers compat polyfills it (limited).
  { pattern: /^node:fs\/promises$|^fs\/promises$/, reason: "node:fs/promises", maxServerPlatforms: ["node", "workers"] },

  // tesseract.js — has both native (Node) and WASM builds; conservative.
  { pattern: /^tesseract\.js-node$/, reason: "tesseract.js-node (native)", maxServerPlatforms: ["node"] },
];

/**
 * Patterns that PROMOTE a module to claim browser support — markers of
 * a browser execution path (WebGPU, DOM, browser-only globals).
 */
const BROWSER_MATCHERS: BrowserMatcher[] = [
  { pattern: /^typegpu(?:\/|$)/, reason: "typegpu (WebGPU)" },
  { pattern: /^@webgpu\//, reason: "@webgpu/* (WebGPU)" },
  { pattern: /^webgpu-utils$/, reason: "webgpu-utils" },
  { pattern: /^@nodetool-ai\/gpu(?:\/|$)/, reason: "@nodetool-ai/gpu (WebGPU shader pool)" }
];

interface ModuleReport {
  file: string;
  platforms: readonly Platform[];
  reasons: string[];
  browserClaims: string[];
  importedFiles: string[];
}

const STATIC_IMPORT_RE =
  /(?:^|\n)\s*(?:import|export)(?:\s+type)?\s+(?:[\w*\s{},]+\s+from\s+)?["']([^"']+)["']/g;
const DYNAMIC_IMPORT_RE = /import\s*\(\s*["']([^"']+)["']\s*\)/g;

interface ImportSet {
  static: Set<string>;
  dynamic: Set<string>;
}

function readImports(file: string): ImportSet {
  const content = readFileSync(file, "utf-8");
  const result: ImportSet = { static: new Set(), dynamic: new Set() };
  for (const m of content.matchAll(STATIC_IMPORT_RE)) result.static.add(m[1]);
  for (const m of content.matchAll(DYNAMIC_IMPORT_RE)) result.dynamic.add(m[1]);
  return result;
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

function union(
  a: readonly Platform[],
  b: readonly Platform[]
): readonly Platform[] {
  const out = [...a];
  for (const p of b) if (!out.includes(p)) out.push(p);
  return out;
}

/**
 * Classify a single entry file by walking its local import graph.
 * Only static imports demote the server set. Both static and dynamic
 * imports can promote browser via WebGPU markers — dynamic loading of a
 * WebGPU lib still implies a browser code path.
 */
function classifyFile(entry: string): ModuleReport {
  const visited = new Set<string>();
  const staticExternals = new Set<string>();
  const dynamicExternals = new Set<string>();
  const stack: string[] = [entry];

  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    let imports: ImportSet;
    try {
      imports = readImports(file);
    } catch {
      continue;
    }

    for (const spec of imports.static) {
      if (isRelative(spec)) {
        const target = resolveRelative(file, spec);
        if (target && !visited.has(target)) stack.push(target);
      } else {
        staticExternals.add(spec);
      }
    }
    for (const spec of imports.dynamic) {
      if (isRelative(spec)) {
        const target = resolveRelative(file, spec);
        if (target && !visited.has(target)) stack.push(target);
      } else {
        dynamicExternals.add(spec);
      }
    }
  }

  // Start at the full server set. Static native imports demote.
  let serverPlatforms: readonly Platform[] = SERVER;
  const reasons: string[] = [];
  for (const ext of staticExternals) {
    for (const m of NATIVE_MATCHERS) {
      if (m.pattern.test(ext)) {
        const before = serverPlatforms.length;
        serverPlatforms = intersect(serverPlatforms, m.maxServerPlatforms);
        if (serverPlatforms.length !== before) {
          reasons.push(`${ext} → ${m.reason}`);
        }
        break;
      }
    }
  }

  // WebGPU markers (static OR dynamic) claim browser. A static WebGPU
  // import on a module that also imports `sharp` statically yields
  // ["node", "browser"] — both platforms work, just via different paths.
  const browserClaims: string[] = [];
  let claimsBrowser = false;
  for (const ext of [...staticExternals, ...dynamicExternals]) {
    for (const m of BROWSER_MATCHERS) {
      if (m.pattern.test(ext)) {
        claimsBrowser = true;
        browserClaims.push(`${ext} → ${m.reason}`);
        break;
      }
    }
  }

  const platforms = claimsBrowser
    ? union(serverPlatforms, ["browser"])
    : serverPlatforms;

  return {
    file: entry.replace(`${SRC_DIR}/`, ""),
    platforms,
    reasons: [...new Set(reasons)].sort(),
    browserClaims: [...new Set(browserClaims)].sort(),
    importedFiles: [...visited].map((f) => f.replace(`${SRC_DIR}/`, ""))
  };
}

function bucketName(p: readonly Platform[]): string {
  const set = new Set(p);
  const hasServer =
    set.has("node") && set.has("workers") && set.has("edge");
  const hasBrowser = set.has("browser");
  if (hasServer && hasBrowser) return "universal";
  if (hasServer) return "server";
  if (set.has("node") && set.has("workers") && !set.has("edge"))
    return "workers+node";
  if (set.has("node") && hasBrowser && p.length === 2) return "hybrid";
  if (p.length === 1 && set.has("node")) return "node-only";
  return "other";
}

function main(): void {
  const entries = readdirSync(NODES_DIR)
    .filter((f) => extname(f) === ".ts" && !f.endsWith(".d.ts"))
    .map((f) => join(NODES_DIR, f))
    .sort();

  const reports = entries.map(classifyFile);
  const byBucket = new Map<string, ModuleReport[]>();
  for (const r of reports) {
    const b = bucketName(r.platforms);
    const list = byBucket.get(b) ?? [];
    list.push(r);
    byBucket.set(b, list);
  }

  const print = (
    label: string,
    bucket: string,
    showReasons: boolean
  ): void => {
    const list = byBucket.get(bucket) ?? [];
    console.log(`\n=== ${label} — ${list.length} files ===`);
    for (const r of list) {
      console.log(`  ${r.file}`);
      if (showReasons) {
        for (const reason of r.reasons) console.log(`    · ${reason}`);
        for (const claim of r.browserClaims) console.log(`    + ${claim}`);
      }
    }
  };

  print("UNIVERSAL (all 4 platforms)", "universal", true);
  print("HYBRID (node, browser)", "hybrid", true);
  print("SERVER (node, workers, edge)", "server", false);
  print("WORKERS+NODE (uses node:fs/promises only)", "workers+node", false);
  print("NODE ONLY", "node-only", true);
  if (byBucket.get("other")?.length) print("OTHER", "other", true);

  const counts = [...byBucket.entries()]
    .map(([k, v]) => `${v.length} ${k}`)
    .join(" · ");
  console.log(`\nSummary: ${counts} (total ${reports.length})`);

  const outPath = "/tmp/base-nodes-classification.json";
  writeFileSync(outPath, JSON.stringify(reports, null, 2));
  console.log(`\nFull report written to ${outPath}`);
}

main();
