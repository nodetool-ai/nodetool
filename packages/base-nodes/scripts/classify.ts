#!/usr/bin/env node
/**
 * classify.ts — AST-based platform classifier for base-nodes.
 *
 * Uses the TypeScript Compiler API to analyse each `src/nodes/*.ts`:
 *
 *   1. Walks imports transitively across local relative imports.
 *   2. Distinguishes static (runtime), type-only (erased), and dynamic
 *      imports. Type-only imports never demote — they compile away.
 *   3. Matches external static imports against NATIVE_MATCHERS to
 *      determine the server platform set.
 *   4. Matches external imports (static OR dynamic) against
 *      BROWSER_MATCHERS to claim browser support.
 *   5. Inspects the AST for fetch / process.env / secret-identifier
 *      references — none of which can fire on string literals or
 *      comments, so the regex-era false positives (e.g. `fetch()`
 *      inside a description string) are gone.
 *   6. A server-portable module with no purity blockers AND no Node-only
 *      dynamic imports is auto-promoted to UNIVERSAL.
 *
 * Output buckets:
 *   UNIVERSAL       — node + workers + edge + browser
 *   HYBRID          — node + browser (WebGPU markers)
 *   SERVER          — node + workers + edge
 *   WORKERS+NODE    — uses node:fs/promises only
 *   NODE ONLY       — native modules, subprocess, sync fs
 *
 * Run with: tsx packages/base-nodes/scripts/classify.ts
 * Output: stdout table + JSON at /tmp/base-nodes-classification.json
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const HERE = dirname(fileURLToPath(import.meta.url));
const NODES_DIR = resolve(HERE, "..", "src", "nodes");
const SRC_DIR = resolve(HERE, "..", "src");

type Platform = "node" | "workers" | "edge" | "browser";

const SERVER: readonly Platform[] = ["node", "workers", "edge"];

interface NativeMatcher {
  pattern: RegExp;
  reason: string;
  maxServerPlatforms: readonly Platform[];
}

interface BrowserMatcher {
  pattern: RegExp;
  reason: string;
}

/** Static-import patterns that demote the server platform set. */
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

  // tesseract.js-node — native; tesseract.js (WASM) is a separate package.
  { pattern: /^tesseract\.js-node$/, reason: "tesseract.js-node (native)", maxServerPlatforms: ["node"] }
];

/** Import-spec patterns that PROMOTE a module to claim browser support. */
const BROWSER_MATCHERS: BrowserMatcher[] = [
  { pattern: /^typegpu(?:\/|$)/, reason: "typegpu (WebGPU)" },
  { pattern: /^@webgpu\//, reason: "@webgpu/* (WebGPU)" },
  { pattern: /^webgpu-utils$/, reason: "webgpu-utils" },
  { pattern: /^@nodetool-ai\/gpu(?:\/|$)/, reason: "@nodetool-ai/gpu (WebGPU shader pool)" }
];

/** Identifier names whose mere reference signals secret access. */
const SECRET_IDENTIFIERS = new Set([
  "_secrets",
  "getApiKey",
  "getSecret",
  "secretResolver"
]);

interface FileAnalysis {
  /** Module specifiers from `import x from "y"` / `export ... from "y"` (runtime). */
  staticImports: Set<string>;
  /** Module specifiers from `await import("y")`. */
  dynamicImports: Set<string>;
  /** `fetch(...)` call anywhere in the file. */
  usesFetch: boolean;
  /** `process.env` referenced anywhere. */
  usesProcessEnv: boolean;
  /** Identifier reference to one of SECRET_IDENTIFIERS. */
  secretRefs: Set<string>;
}

/** Parse a file and walk the AST once, collecting everything we care about. */
function analyzeFile(filePath: string): FileAnalysis {
  const result: FileAnalysis = {
    staticImports: new Set(),
    dynamicImports: new Set(),
    usesFetch: false,
    usesProcessEnv: false,
    secretRefs: new Set()
  };

  let source: ts.SourceFile;
  try {
    source = ts.createSourceFile(
      filePath,
      readFileSync(filePath, "utf-8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS
    );
  } catch {
    return result;
  }

  function addStaticIfNotTypeOnly(
    spec: string,
    isTypeOnly: boolean
  ): void {
    if (isTypeOnly) return;
    result.staticImports.add(spec);
  }

  function visit(node: ts.Node): void {
    // import x from "y";   import "y";   import type {...} from "y";
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (ts.isStringLiteral(spec)) {
        const isTypeOnly = node.importClause?.isTypeOnly ?? false;
        addStaticIfNotTypeOnly(spec.text, isTypeOnly);
      }
    }
    // export {x} from "y";   export * from "y";
    else if (ts.isExportDeclaration(node) && node.moduleSpecifier) {
      if (ts.isStringLiteral(node.moduleSpecifier)) {
        addStaticIfNotTypeOnly(node.moduleSpecifier.text, node.isTypeOnly);
      }
    }
    // CommonJS-style require("y") — rare in this codebase but cheap to detect.
    else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "require" &&
      node.arguments.length === 1 &&
      ts.isStringLiteral(node.arguments[0])
    ) {
      result.staticImports.add((node.arguments[0] as ts.StringLiteral).text);
    }
    // Dynamic import: import("y") — node.expression is ImportKeyword (a token, not an Identifier).
    else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword
    ) {
      const arg = node.arguments[0];
      if (arg && ts.isStringLiteral(arg)) {
        result.dynamicImports.add(arg.text);
      }
    }
    // fetch(...)   — only when the callee is the bare identifier `fetch`,
    // not `obj.fetch(...)` or `myFetch(...)`.
    else if (
      ts.isCallExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "fetch"
    ) {
      result.usesFetch = true;
    }
    // process.env or process.env.XXX   — match the inner `process.env` access.
    else if (
      ts.isPropertyAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      node.name.text === "env"
    ) {
      result.usesProcessEnv = true;
    }
    // process["env"]   — same thing via element access.
    else if (
      ts.isElementAccessExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === "process" &&
      ts.isStringLiteral(node.argumentExpression) &&
      node.argumentExpression.text === "env"
    ) {
      result.usesProcessEnv = true;
    }
    // Bare identifier reference to a known secret-related name.
    else if (ts.isIdentifier(node) && SECRET_IDENTIFIERS.has(node.text)) {
      // Skip when the identifier is the *name* in a declaration or a
      // property name in an object literal — only count actual references.
      const parent = node.parent;
      const isDeclName =
        (ts.isVariableDeclaration(parent) && parent.name === node) ||
        (ts.isParameter(parent) && parent.name === node) ||
        (ts.isPropertyAssignment(parent) && parent.name === node) ||
        (ts.isPropertyDeclaration(parent) && parent.name === node) ||
        (ts.isMethodDeclaration(parent) && parent.name === node) ||
        (ts.isFunctionDeclaration(parent) && parent.name === node) ||
        (ts.isMethodSignature(parent) && parent.name === node) ||
        (ts.isPropertySignature(parent) && parent.name === node) ||
        (ts.isImportSpecifier(parent) && parent.name === node);
      if (!isDeclName) {
        result.secretRefs.add(node.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(source);
  return result;
}

interface ModuleReport {
  file: string;
  platforms: readonly Platform[];
  reasons: string[];
  browserClaims: string[];
  purityBlockers: string[];
  importedFiles: string[];
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

const analysisCache = new Map<string, FileAnalysis>();
function getAnalysis(file: string): FileAnalysis {
  let cached = analysisCache.get(file);
  if (cached) return cached;
  cached = analyzeFile(file);
  analysisCache.set(file, cached);
  return cached;
}

function classifyFile(entry: string): ModuleReport {
  const visited = new Set<string>();
  const staticExternals = new Set<string>();
  const dynamicExternals = new Set<string>();
  let usesFetch = false;
  let usesProcessEnv = false;
  const secretRefs = new Set<string>();
  const stack: string[] = [entry];

  while (stack.length > 0) {
    const file = stack.pop()!;
    if (visited.has(file)) continue;
    visited.add(file);

    const a = getAnalysis(file);
    if (a.usesFetch) usesFetch = true;
    if (a.usesProcessEnv) usesProcessEnv = true;
    for (const r of a.secretRefs) secretRefs.add(r);

    for (const spec of a.staticImports) {
      if (isRelative(spec)) {
        const target = resolveRelative(file, spec);
        if (target && !visited.has(target)) stack.push(target);
      } else {
        staticExternals.add(spec);
      }
    }
    for (const spec of a.dynamicImports) {
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

  // WebGPU markers (static OR dynamic) claim browser.
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

  // Universal promotion: pure-JS, server-portable, no Node-only dynamic
  // imports. AST-based detection — no false positives from comments or
  // strings that mention these symbols in descriptions.
  const isServerPortable =
    serverPlatforms.length === SERVER.length &&
    SERVER.every((p) => serverPlatforms.includes(p));
  const purityBlockers: string[] = [];
  if (isServerPortable) {
    if (usesFetch) purityBlockers.push("fetch() call (browser CORS risk)");
    if (usesProcessEnv)
      purityBlockers.push("process.env (not available in browsers)");
    for (const ref of secretRefs) {
      purityBlockers.push(`${ref} (browsers can't hold secrets)`);
    }
    for (const ext of dynamicExternals) {
      for (const m of NATIVE_MATCHERS) {
        if (m.pattern.test(ext) && !m.maxServerPlatforms.includes("workers")) {
          purityBlockers.push(`dynamic import("${ext}") — Node-only path`);
          break;
        }
      }
    }
  }
  const isPure = isServerPortable && purityBlockers.length === 0;

  let platforms: readonly Platform[];
  if (isPure) {
    platforms = union(serverPlatforms, ["browser"]);
  } else if (claimsBrowser) {
    platforms = union(serverPlatforms, ["browser"]);
  } else {
    platforms = serverPlatforms;
  }

  return {
    file: entry.replace(`${SRC_DIR}/`, ""),
    platforms,
    reasons: [...new Set(reasons)].sort(),
    browserClaims: [...new Set(browserClaims)].sort(),
    purityBlockers: [...new Set(purityBlockers)].sort(),
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
        for (const b of r.purityBlockers) console.log(`    × ${b}`);
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
