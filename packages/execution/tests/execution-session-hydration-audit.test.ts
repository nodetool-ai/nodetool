/**
 * Every surface that hands `ExecutionSession` a `registry` must also hand it a
 * `resolveNodeType`.
 *
 * The registry-only branch hydrates node flags and leaves `propertyTypes`
 * empty. Correlation analysis reads list-ness only from that map, so on that
 * branch every `list[...]` handle reads as non-list: a stream arriving on one
 * collapses to empty scope and the node runs once on the last value. The graph
 * still "works", it just quietly produces less than the same graph does under
 * `workflows run`.
 *
 * That is not a hypothetical. `nodetool debug` shipped on the registry-only
 * branch and disagreed with the runner on the same file — `animate` ran once
 * under `debug` and twice under `workflows run` — which sent a debugging
 * session after a kernel bug that did not exist. Four more surfaces had the
 * same omission. A per-site fix does not hold a class of bug that has already
 * recurred five times, so this audits the source instead.
 *
 * Callers that pre-hydrate (`Graph.loadFromDict` with their own resolver) pass
 * no `registry` at all and so are not matched.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const packagesDir = join(repoRoot, "packages");

function* sourceFiles(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === "dist" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) yield full;
  }
}

/** `ExecutionSession.create({...})` call sites, with their option text. */
function callSites(source: string): string[] {
  const sites: string[] = [];
  const marker = "ExecutionSession.create(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    from = at + marker.length;
    // Walk to the matching paren so the whole options object is inspected,
    // however long it is.
    let depth = 0;
    let end = at + marker.length - 1;
    for (let i = end; i < source.length; i++) {
      const ch = source[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    sites.push(source.slice(at, end + 1));
  }
  return sites;
}

describe("ExecutionSession hydration audit", () => {
  it("no surface passes a registry without a resolveNodeType", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(packagesDir)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("ExecutionSession.create(")) continue;
      for (const site of callSites(source)) {
        const passesRegistry = /(^|[\s{,])registry\s*[,:}]/.test(site);
        if (!passesRegistry) continue; // pre-hydrating caller
        if (site.includes("resolveNodeType")) continue;
        offenders.push(relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  // The audit is only meaningful if it can actually see the call sites.
  it("finds the call sites it claims to audit", () => {
    let found = 0;
    for (const file of sourceFiles(packagesDir)) {
      found += callSites(readFileSync(file, "utf8")).length;
    }
    expect(found).toBeGreaterThan(5);
  });
});
