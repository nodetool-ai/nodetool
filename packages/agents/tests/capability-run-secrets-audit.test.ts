/**
 * Every host that builds a `CapabilityRun` must decide, in writing, whether
 * that run can answer which credentials this install holds.
 *
 * `validate_workflow` reports a `missing_secret` warning only for a run
 * carrying `availableSecrets`. A host that forgets it does not get a wrong
 * answer — it gets *no* answer, silently, which is the failure mode that let
 * the agent surface pass a graph `nodetool validate` warns about. A per-site
 * fix does not hold that: the next host to be added omits it the same way.
 * So the audit reads the sources.
 *
 * The omission list is not an exemption. An entry means that run cannot tell a
 * key nobody set from one it could not look up, and the reason has to say why
 * that is the right answer there.
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
    if (entry === "node_modules" || entry === "dist" || entry.startsWith(".")) {
      continue;
    }
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* sourceFiles(full);
    else if (entry.endsWith(".ts") && !entry.endsWith(".test.ts")) yield full;
  }
}

/** `createCapabilityRun({...})` call sites, with their whole options object. */
function callSites(source: string): string[] {
  const sites: string[] = [];
  const marker = "createCapabilityRun(";
  let from = 0;
  for (;;) {
    const at = source.indexOf(marker, from);
    if (at === -1) break;
    from = at + marker.length;
    // An import, a re-export, or the declaration itself is not a call.
    const before = source[at - 1];
    if (before !== undefined && /[\w.]/.test(before)) continue;
    if (source.slice(Math.max(0, at - 9), at) === "function ") continue;
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
 * Runs that knowingly cannot report a missing credential, and why. Every one
 * of them serves a fixed, narrow capability set that never validates a graph.
 *
 * `sites` is how many omitting calls that file is allowed, so a file that is
 * partly wired — `mcp-tools.ts` builds five runs and only the workflow belt
 * validates graphs — cannot absorb a sixth omission unnoticed.
 */
const OMITS_SECRET_RESOLVER: Record<string, { reason: string; sites: number }> =
  {
    // Serves exactly the one tool it wraps; that tool builds its own run, and
    // this one never reaches an implementation that validates a graph.
    "packages/agents/src/capabilities/gate-tools.ts": {
      reason: "one-call run over a single wrapped tool",
      sites: 1
    },
    "packages/agents/src/capabilities/files.ts": {
      reason: "workspace file capabilities only",
      sites: 1
    },
    "packages/agents/src/capabilities/google.ts": {
      reason: "Google Workspace capabilities only",
      sites: 1
    },
    "packages/agents/src/capabilities/scripts.ts": {
      reason: "internal run for generate_speech",
      sites: 1
    },
    // The `ui_*` document tools, node discovery, and `find_model`/
    // `list_models`. None validates a graph; the workflow belt above them
    // does, and it injects. The media belt was a fourth site and is gone: the
    // media tools are built-ins now, over the run `getBuiltinTools()` builds,
    // which does inject.
    "packages/agents/src/tools/mcp-tools.ts": {
      reason: "document, discovery and model belts validate no graph",
      sites: 3
    }
  };

/**
 * A site whose whole argument is one identifier carries its options in a
 * variable (`createCapabilityRun(runOptions)`), so read that declaration
 * instead — otherwise the audit reports a wired host as an omission.
 */
function resolvedSite(source: string, site: string): string {
  const arg = site.slice("createCapabilityRun(".length, -1).trim();
  if (!/^[A-Za-z_$][\w$]*$/.test(arg)) return site;
  const at = source.search(
    new RegExp(`(const|let|var)\\s+${arg}\\s*[:=]`)
  );
  if (at === -1) return site;
  const open = source.indexOf("{", at);
  if (open === -1) return site;
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(at, i + 1);
    }
  }
  return site;
}

function auditedSites(): Array<{ file: string; site: string }> {
  const found: Array<{ file: string; site: string }> = [];
  for (const file of sourceFiles(packagesDir)) {
    const source = readFileSync(file, "utf8");
    if (!source.includes("createCapabilityRun(")) continue;
    for (const site of callSites(source)) {
      found.push({
        file: relative(repoRoot, file).replaceAll("\\", "/"),
        site: resolvedSite(source, site)
      });
    }
  }
  return found;
}

describe("CapabilityRun secret-availability audit", () => {
  /** file → how many of its calls pass no `availableSecrets`. */
  function omissionCounts(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const { file, site } of auditedSites()) {
      if (site.includes("availableSecrets")) continue;
      counts[file] = (counts[file] ?? 0) + 1;
    }
    return counts;
  }

  it("every host either resolves secrets or is a recorded omission", () => {
    const unexpected = Object.entries(omissionCounts())
      .filter(
        ([file, count]) => OMITS_SECRET_RESOLVER[file]?.sites !== count
      )
      .map(([file, count]) => `${file} (${count})`);
    expect(unexpected).toEqual([]);
  });

  // An entry that no longer describes anything silently widens the audit.
  it("every recorded omission still omits", () => {
    const counts = omissionCounts();
    const stale = Object.keys(OMITS_SECRET_RESOLVER).filter(
      (rel) => (counts[rel] ?? 0) === 0
    );
    expect(stale).toEqual([]);
  });

  // A walk that matched nothing would pass both assertions above.
  it("finds the call sites it claims to audit", () => {
    const sites = auditedSites();
    expect(sites.length).toBeGreaterThan(10);
    const files = new Set(sites.map((s) => s.file));
    // The three hosts with a real secret store, named rather than counted.
    expect(files).toContain("packages/websocket/src/session/chat-turn.ts");
    expect(files).toContain("packages/websocket/src/mcp-agent-tools.ts");
    expect(files).toContain("packages/cli/src/stdin.ts");
  });

  // The belt hosts inject through `getAllMcpTools`, which takes a factory
  // rather than a resolver — a different option the audit above cannot see.
  it("the server's host deps supply a secret-availability factory", () => {
    const source = readFileSync(
      join(repoRoot, "packages/websocket/src/mcp-tool-deps.ts"),
      "utf8"
    );
    expect(source).toContain("secretAvailability: contextSecretAvailability");
  });
});
