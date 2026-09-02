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

/**
 * Surfaces that knowingly run un-hydrated, with the reason. An entry here is a
 * debt, not an exemption: it means that surface executes graphs differently
 * from the runner.
 */
const KNOWN_UNHYDRATED: Record<string, string> = {
  // Mini-app widgets bind to outputs by node id (`op:main/out:out1`), which is
  // the key the un-hydrated path produces; hydrating re-keys them by the
  // node's name and every binding stops resolving —
  // `app-debug-route.test.ts` and `app-build-route.test.ts` fail on exactly
  // that. Which key an app document should bind is a question about the
  // binding contract, not something to change underneath it.
  "packages/execution/src/service/app-run-server.ts":
    "app bindings resolve outputs by the un-hydrated key"
};

/**
 * Hosts that let an `ExecutionPreflightError` propagate instead of handling
 * it, with where it is answered. An entry here is a decision, not an
 * exemption: it says the refusal reaches a user through someone else's
 * reporting, and names who.
 */
const PREFLIGHT_PROPAGATORS: Record<string, string> = {
  // Called only from `nodetool run --supervise`, whose catch prints the
  // refusal through `describeRunFailure`.
  "packages/cli/src/run-dsl-supervised.ts":
    "propagates to the `nodetool run` command's own reporting",
  // A refused graph is a failed eval case; the harness records the throw as
  // that case's error, which is exactly what a graph the runtime cannot
  // honour should score.
  "packages/cli/src/evals/graph-runner.ts":
    "a refusal is the eval case's failure"
};

describe("ExecutionSession preflight audit", () => {
  it("every host either handles a preflight refusal or documents who does", () => {
    const offenders: string[] = [];
    let hosts = 0;
    for (const file of sourceFiles(packagesDir)) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("ExecutionSession.create(")) continue;
      hosts++;
      if (source.includes("isExecutionPreflightError")) continue;
      offenders.push(relative(repoRoot, file));
    }
    // The audit is only meaningful if it saw the hosts it claims to audit.
    expect(hosts).toBeGreaterThan(5);
    expect(offenders.filter((f) => !(f in PREFLIGHT_PROPAGATORS))).toEqual([]);
  });

  it("every propagator entry still names a real host that propagates", () => {
    const stale = Object.keys(PREFLIGHT_PROPAGATORS).filter((rel) => {
      const source = readFileSync(join(repoRoot, rel), "utf8");
      return (
        !source.includes("ExecutionSession.create(") ||
        source.includes("isExecutionPreflightError")
      );
    });
    expect(stale).toEqual([]);
  });
});

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
    const unexpected = offenders.filter((f) => !(f in KNOWN_UNHYDRATED));
    expect(unexpected).toEqual([]);
  });

  // An entry that no longer describes anything is worse than no entry: it
  // silently widens the audit.
  it("every known-unhydrated entry is still un-hydrated", () => {
    const stale = Object.keys(KNOWN_UNHYDRATED).filter((rel) => {
      const source = readFileSync(join(repoRoot, rel), "utf8");
      return callSites(source).every((site) => site.includes("resolveNodeType"));
    });
    expect(stale).toEqual([]);
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
