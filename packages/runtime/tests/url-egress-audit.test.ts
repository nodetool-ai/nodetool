/**
 * The URL-egress inventory is only worth what the audit around it proves.
 *
 * A hand-written list of "places we fetch a caller's URL" rots on the first PR
 * that adds one. So this reads the source: it finds every plain `fetch(<var>)`
 * in `packages/*​/src`, and every file that calls a screening function, and
 * requires the inventory to classify both sets. A new unscreened fetch fails
 * here with the file named; a guarded surface that quietly loses its guard
 * fails here too.
 *
 * The scan asserts it *found* things before it asserts anything about them —
 * a broken regex would otherwise pass by matching nothing, which is the exact
 * failure mode this repo has been bitten by (see AGENTS.md § Claims, Checks,
 * and Measurements).
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  URL_EGRESS_INVENTORY,
  type EgressEntry
} from "./url-egress-inventory.js";

const REPO_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  ".."
);
const PACKAGES = path.join(REPO_ROOT, "packages");

function sourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "dist") continue;
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
        out.push(full);
      }
    }
  };
  for (const pkg of readdirSync(PACKAGES)) {
    const src = path.join(PACKAGES, pkg, "src");
    try {
      if (statSync(src).isDirectory()) walk(src);
    } catch {
      // A package without a src/ directory (sandbox packs) has no code to scan.
    }
  }
  return out;
}

const relative = (file: string): string =>
  path.relative(REPO_ROOT, file).split(path.sep).join("/");

/**
 * A `fetch` whose first argument is a name rather than a literal — i.e. a URL
 * that came from somewhere. `fetch("https://…")` and `` fetch(`${BASE}/x`) ``
 * are constants by construction and are not what this looks for.
 *
 * Injected fetch implementations (`fetchImpl`, `fetchFn`) are the seam a
 * screened caller passes *into* `safeFetch`, not a call site of their own.
 */
const PLAIN_FETCH = /(?<![.\w$])fetch\(\s*([A-Za-z_$][\w$]*(?:\.[\w$]+)*)/g;
const INJECTED = new Set(["fetchImpl", "fetchFn"]);

/** Files with a plain `fetch(<var>)`, mapped to the arguments found. */
function scanPlainFetches(): Map<string, string[]> {
  const found = new Map<string, string[]>();
  for (const file of sourceFiles()) {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const trimmed = line.trimStart();
      // Comments describe calls; they are not calls.
      if (
        trimmed.startsWith("*") ||
        trimmed.startsWith("//") ||
        trimmed.startsWith("/*")
      ) {
        continue;
      }
      PLAIN_FETCH.lastIndex = 0;
      let match: RegExpExecArray | null;
      while ((match = PLAIN_FETCH.exec(line)) !== null) {
        // An odd number of quotes before the match means it sits inside a
        // string — prompt text that documents `fetch(url)` to a model.
        const quotes = line.slice(0, match.index).match(/(?<!\\)["'`]/g) ?? [];
        if (quotes.length % 2 === 1) continue;
        if (INJECTED.has(match[1])) continue;
        const key = relative(file);
        const args = found.get(key) ?? [];
        args.push(match[1]);
        found.set(key, args);
      }
    }
  }
  return found;
}

/** The screening functions a file may reach a protected fetch through. */
const SCREENING_SYMBOLS = [
  "safeFetch",
  "fetchExternalMedia",
  "assertSafePublicHttpsUrl",
  "isSafePublicHttpsUrl",
  "isBlockedIpLiteral",
  "assertFetchUrlAllowed",
  "assertResolvedHostAllowed",
  "isSafeHttpUrl"
];

/** Files that call at least one screening function. */
function scanScreenedFiles(): Set<string> {
  const calls = new RegExp(`(?<![.\\w$])(${SCREENING_SYMBOLS.join("|")})\\(`);
  const found = new Set<string>();
  for (const file of sourceFiles()) {
    if (calls.test(readFileSync(file, "utf8"))) found.add(relative(file));
  }
  return found;
}

const plainFetches = scanPlainFetches();
const screenedFiles = scanScreenedFiles();
const entriesByFile = new Map<string, EgressEntry[]>();
for (const entry of URL_EGRESS_INVENTORY) {
  const list = entriesByFile.get(entry.file) ?? [];
  list.push(entry);
  entriesByFile.set(entry.file, list);
}

describe("url egress inventory", () => {
  it("scans a real repo and finds URL surfaces in it", () => {
    // The positive control. Every assertion below is vacuous if the walk or
    // the regexes stop matching, so prove they matched before trusting them.
    expect(sourceFiles().length).toBeGreaterThan(500);
    // Lowered from 50: consolidating the per-vendor retry/poll loops into one
    // shared transport removed several bare fetches. This floor exists so the
    // scan cannot pass by matching nothing, not as a security threshold.
    expect(plainFetches.size).toBeGreaterThanOrEqual(45);
    expect(screenedFiles.size).toBeGreaterThanOrEqual(30);
    expect(URL_EGRESS_INVENTORY.length).toBeGreaterThanOrEqual(70);
  });

  it("names a policy and a source for every entry", () => {
    const incomplete = URL_EGRESS_INVENTORY.filter(
      (entry) =>
        !entry.policy ||
        !entry.inputSource ||
        !entry.owner ||
        !entry.note ||
        !entry.dnsRebinding ||
        !entry.redirects
    );
    expect(incomplete.map((entry) => entry.file)).toEqual([]);
  });

  it("points every entry at a file that exists", () => {
    const missing = URL_EGRESS_INVENTORY.filter(
      (entry) => !statSync(path.join(REPO_ROOT, entry.file), { throwIfNoEntry: false })
    );
    expect(missing.map((entry) => entry.file)).toEqual([]);
  });

  it("records at most one entry per file and policy", () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of URL_EGRESS_INVENTORY) {
      const key = `${entry.file}::${entry.policy}`;
      if (seen.has(key)) duplicates.push(key);
      seen.add(key);
    }
    expect(duplicates).toEqual([]);
  });

  it("classifies every plain fetch of a caller-provided URL", () => {
    // The ratchet: a new `fetch(url)` anywhere under packages/*/src has to be
    // classified here — screened, or exempt with the reason written down.
    const unclassified = [...plainFetches.keys()].filter(
      (file) => !entriesByFile.has(file)
    );
    expect(unclassified).toEqual([]);
  });

  it("gives every file with a plain fetch a non-guarded entry explaining it", () => {
    // "guarded" means the caller-provided URLs here go through a protected
    // fetch. A file that still has a plain one needs an entry that says what
    // that plain one is — fixed host, browser-side, private integration.
    const onlyGuarded = [...plainFetches.keys()].filter((file) =>
      (entriesByFile.get(file) ?? []).every((entry) => entry.policy === "guarded")
    );
    expect(onlyGuarded).toEqual([]);
  });

  it("keeps every guarded file actually calling its screening function", () => {
    const broken: string[] = [];
    for (const entry of URL_EGRESS_INVENTORY) {
      if (entry.guardedBy.length === 0) {
        if (entry.policy === "guarded") broken.push(`${entry.file}: no guardedBy`);
        continue;
      }
      const source = readFileSync(path.join(REPO_ROOT, entry.file), "utf8");
      for (const symbol of entry.guardedBy) {
        if (!new RegExp(`(?<![.\\w$])${symbol}\\(`).test(source)) {
          broken.push(`${entry.file}: ${symbol} not called`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it("classifies every file that calls a screening function", () => {
    const unclassified = [...screenedFiles].filter(
      (file) => !entriesByFile.has(file)
    );
    expect(unclassified).toEqual([]);
  });

  it("keeps the address table in one place", () => {
    // `isSafeExternalUrl` was the third copy, inside the websocket runner: an
    // http-permitting predicate that screened the first URL and no redirect.
    // It is deleted; this fails if it — or another private copy — comes back.
    const copies = sourceFiles().filter((file) =>
      /function\s+isSafeExternalUrl/.test(readFileSync(file, "utf8"))
    );
    expect(copies.map(relative)).toEqual([]);
  });

  it("routes public media fetches through the redirect-aware fetch", () => {
    // A predicate can reject a URL; only safeFetch re-checks each hop. Every
    // entry that claims per-hop redirect checking must reach one of the two
    // protected fetches, not a bare predicate.
    // loadMediaRefBytes counts because it is not a predicate: its http(s)
    // branch ends in fetchExternalMedia, and media-ref-bytes.ts carries its own
    // guarded entry, so a caller delegating to it still gets per-hop checking.
    const protectedFetches = [
      "safeFetch",
      "fetchExternalMedia",
      "loadMediaRefBytes"
    ];
    const offenders = URL_EGRESS_INVENTORY.filter(
      (entry) =>
        entry.policy === "guarded" &&
        entry.redirects === "checked-per-hop" &&
        !entry.guardedBy.some((symbol) => protectedFetches.includes(symbol))
    );
    expect(offenders.map((entry) => entry.file)).toEqual([]);
  });

  it("documents every screened and exempted surface in the reader-facing doc", () => {
    // The doc is what a contributor reads; the data is what CI reads. The
    // fixed-host rows are a long tail nobody reads one by one — the doc gives
    // them a rule and a count — but every surface where the answer was a
    // judgement call is written out, and drifts the moment one is edited alone.
    const doc = readFileSync(
      path.join(REPO_ROOT, "docs/url-egress-inventory.md"),
      "utf8"
    );
    const mustDocument = new Set(
      URL_EGRESS_INVENTORY.filter(
        (entry) => entry.policy !== "fixed-host" && entry.policy !== "infrastructure"
      ).map((entry) => entry.file)
    );
    const undocumented = [...mustDocument].filter((file) => !doc.includes(file));
    expect(undocumented).toEqual([]);
  });
});
