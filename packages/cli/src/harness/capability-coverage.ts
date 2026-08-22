/**
 * Capability coverage: what proves each agent capability still works.
 *
 * The harness registry answers the question one level up — which harness
 * covers which product *surface* — and `SurfaceEntry.paths` is deliberately
 * coarse: `packages/agents/` is one path, and a diff that adds a capability
 * to it lights up the same checks a diff that renames a local variable does.
 * That is the hole this table fills. Every exported capability is named here
 * with the file that implements it, the checked-in suites a selfcheck runs
 * over it, the eval cases that drive a model through it, or — when nothing
 * does yet — a written gap note.
 *
 * The invariant is the registry's, one rung down: no capability without a
 * check or a documented gap. It is enforced by `capability-coverage.test.ts`
 * (the audit, plus the on-disk checks the pure audit cannot make) and by
 * `nodetool harness capabilities --strict`.
 *
 * `contract` is a fingerprint of what the capability *declares* — its name,
 * description, input schema, permission category, and whether it needs the
 * caller's tool-call id. It is generated, never hand-written: run
 * `npm run capabilities:sync` after touching a spec. It exists so the gate can
 * tell a contract change from a refactor: `nodetool harness gate --base <ref>`
 * demands a new or changed mapping only when a capability is added or its
 * fingerprint moves.
 */

import { createHash } from "node:crypto";

import { isRecord } from "../predicates.js";
import type { HarnessEntry } from "./registry.js";

/** The fields of a spec the fingerprint is taken over. */
export interface CapabilityContractInput {
  name: string;
  description: string;
  inputSchema: unknown;
  category: string;
  needsToolCallId?: boolean;
}

/** Key order is not part of a contract, so the payload is sorted first. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([key, inner]) => [key, canonical(inner)])
    );
  }
  return value;
}

/**
 * What a capability promises its callers, as twelve hex digits: the wire name,
 * the description a model reads, the input schema, the permission category,
 * and whether it needs the caller's tool-call id. Everything else about an
 * implementation can move without a caller noticing.
 */
export function capabilityContractFingerprint(
  spec: CapabilityContractInput
): string {
  const payload = canonical({
    name: spec.name,
    description: spec.description,
    inputSchema: spec.inputSchema,
    category: spec.category,
    needsToolCallId: spec.needsToolCallId ?? false
  });
  return createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex")
    .slice(0, 12);
}

/** Eval cases that drive one capability, by defining file. */
export interface CapabilityEvalRef {
  /** Repo-relative file that declares the case ids. */
  file: string;
  /** Case ids inside that file. */
  cases: string[];
}

export interface CapabilityCoverageEntry {
  /** Wire name, as a guest or a model calls it. */
  name: string;
  /** The capability module that owns it. */
  module: string;
  /** Repo-relative implementation file. */
  impl: string;
  /** Generated fingerprint of the declared contract. Never hand-edit. */
  contract: string;
  /** Harness id whose selfcheck runs {@link suites}. */
  selfcheck?: string;
  /** Checked-in suites that name this capability. Required with a selfcheck. */
  suites?: string[];
  /** Eval cases that drive a model through it. */
  evals?: CapabilityEvalRef[];
  /** Required when there is neither a selfcheck nor an eval case. */
  gap?: string;
}

/** What the audit compares the table against: the live capability registry. */
export interface DeclaredCapability {
  name: string;
  module: string;
  contract: string;
}

export interface CapabilityAuditResult {
  rows: Array<{
    name: string;
    module: string;
    covered: boolean;
    selfcheck?: string;
    evalCases: number;
    gap?: string;
  }>;
  coveredCount: number;
  gapCount: number;
  /** Declared capabilities with no entry — the failure this table exists for. */
  unmapped: string[];
  /** Entries naming a capability no module declares any more. */
  stale: string[];
  /** Entries with no selfcheck, no eval case, and no gap note. */
  undocumentedGaps: string[];
  /** Entries whose `selfcheck` is not a harness that has one. */
  unknownSelfchecks: string[];
  /** Entries claiming a selfcheck but naming no suite. */
  selfchecksWithoutSuites: string[];
  /** Entries whose `contract` disagrees with the live spec. */
  contractDrift: string[];
  /** Entries whose `module` disagrees with the registry. */
  moduleMismatches: string[];
  /** Names appearing in the table twice. */
  duplicates: string[];
}

/**
 * The table against the live registry. Pure: on-disk checks (does the impl
 * file exist, does the suite name the capability, does the eval file declare
 * the case) live in the test, which can read the repo.
 */
export function auditCapabilityCoverage(
  declared: readonly DeclaredCapability[],
  entries: readonly CapabilityCoverageEntry[],
  harnesses: readonly HarnessEntry[]
): CapabilityAuditResult {
  const selfcheckable = new Set(
    harnesses.filter((h) => h.selfcheck).map((h) => h.id)
  );
  const byName = new Map<string, CapabilityCoverageEntry>();
  const duplicates: string[] = [];
  for (const entry of entries) {
    if (byName.has(entry.name)) {
      duplicates.push(entry.name);
      continue;
    }
    byName.set(entry.name, entry);
  }

  const declaredByName = new Map(declared.map((d) => [d.name, d]));
  const unmapped = declared
    .filter((d) => !byName.has(d.name))
    .map((d) => d.name);
  const stale: string[] = [];
  const undocumentedGaps: string[] = [];
  const unknownSelfchecks: string[] = [];
  const selfchecksWithoutSuites: string[] = [];
  const contractDrift: string[] = [];
  const moduleMismatches: string[] = [];

  const rows = entries.map((entry) => {
    const live = declaredByName.get(entry.name);
    if (!live) {
      stale.push(entry.name);
    } else {
      if (live.module !== entry.module) {
        moduleMismatches.push(
          `${entry.name}: table says ${entry.module}, registry says ${live.module}`
        );
      }
      if (live.contract !== entry.contract) {
        contractDrift.push(
          `${entry.name}: table says ${entry.contract}, registry says ${live.contract}`
        );
      }
    }
    if (entry.selfcheck !== undefined) {
      if (!selfcheckable.has(entry.selfcheck)) {
        unknownSelfchecks.push(`${entry.name} → ${entry.selfcheck}`);
      }
      if (!entry.suites || entry.suites.length === 0) {
        selfchecksWithoutSuites.push(entry.name);
      }
    }
    const evalCases = (entry.evals ?? []).reduce(
      (sum, ref) => sum + ref.cases.length,
      0
    );
    const covered = entry.selfcheck !== undefined || evalCases > 0;
    if (!covered && !entry.gap) undocumentedGaps.push(entry.name);
    return {
      name: entry.name,
      module: entry.module,
      covered,
      ...(entry.selfcheck && { selfcheck: entry.selfcheck }),
      evalCases,
      ...(entry.gap && { gap: entry.gap })
    };
  });

  return {
    rows,
    coveredCount: rows.filter((r) => r.covered).length,
    gapCount: rows.filter((r) => !r.covered).length,
    unmapped,
    stale,
    undocumentedGaps,
    unknownSelfchecks,
    selfchecksWithoutSuites,
    contractDrift,
    moduleMismatches,
    duplicates
  };
}

// ---------------------------------------------------------------------------
// The gate: a contract that moved must move its mapping with it.
// ---------------------------------------------------------------------------

/**
 * One entry's literal text, keyed by wire name, read out of the table's
 * source. Textual on purpose: the gate compares this file at two git refs, and
 * `git show <ref>:<path>` hands back source, not a module it can import.
 *
 * The scan is structural — brace depth inside the array literal — so it does
 * not care how the entries are wrapped, only that each carries a
 * `name: "..."` field.
 */
export function extractCoverageBlocks(
  source: string
): ReadonlyMap<string, string> {
  const blocks = new Map<string, string>();
  const marker = source.indexOf("CAPABILITY_COVERAGE");
  if (marker === -1) return blocks;
  // Past the type annotation — `CapabilityCoverageEntry[]` carries a bracket
  // of its own — to the `[` that opens the array literal.
  const assign = source.indexOf("=", marker);
  if (assign === -1) return blocks;
  const start = source.indexOf("[", assign);
  if (start === -1) return blocks;

  let depth = 0;
  let blockStart = -1;
  for (let i = start + 1; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "]" && depth === 0) break;
    if (ch === "{") {
      if (depth === 0) blockStart = i;
      depth += 1;
    } else if (ch === "}") {
      depth -= 1;
      if (depth === 0 && blockStart !== -1) {
        const text = source.slice(blockStart, i + 1);
        const name = /name:\s*"([^"]+)"/.exec(text)?.[1];
        if (name !== undefined && !blocks.has(name)) blocks.set(name, text);
        blockStart = -1;
      }
    }
  }
  return blocks;
}

/** An entry's text with the generated fingerprint removed. */
function coverageSignature(block: string): string {
  return block.replace(/contract:\s*"[^"]*",?\s*/g, "");
}

export interface CapabilityMappingViolation {
  name: string;
  /** What moved without the mapping moving with it. */
  reason: "contract-changed";
  detail: string;
}

export interface CapabilityMappingGateResult {
  /** Capabilities the diff adds to the table. */
  added: string[];
  /** Capabilities whose contract fingerprint moved in the diff. */
  contractChanged: string[];
  /** Capabilities the diff removes from the table. */
  removed: string[];
  /** Contract changes that left the coverage mapping untouched. */
  violations: CapabilityMappingViolation[];
}

/**
 * Compare the table at two refs. A capability that is new, or whose coverage
 * fields changed, satisfies the rule by construction; a contract that moved
 * while the mapping stood still does not.
 *
 * `baseSource` is null when the file does not exist at the base ref — every
 * entry is then new, and nothing is a violation.
 */
export function planCapabilityMappingGate(
  baseSource: string | null,
  headSource: string
): CapabilityMappingGateResult {
  const base = baseSource === null ? new Map() : extractCoverageBlocks(baseSource);
  const head = extractCoverageBlocks(headSource);

  const added: string[] = [];
  const contractChanged: string[] = [];
  const violations: CapabilityMappingViolation[] = [];

  for (const [name, block] of head) {
    const before = base.get(name);
    if (before === undefined) {
      added.push(name);
      continue;
    }
    const contractMoved =
      /contract:\s*"([^"]*)"/.exec(before)?.[1] !==
      /contract:\s*"([^"]*)"/.exec(block)?.[1];
    if (!contractMoved) continue;
    contractChanged.push(name);
    if (coverageSignature(before) === coverageSignature(block)) {
      violations.push({
        name,
        reason: "contract-changed",
        detail:
          `${name} changed its declared contract, but its coverage mapping ` +
          "(selfcheck, suites, evals, gap) is unchanged — name the eval case " +
          "or suite that covers the new contract, or write a gap note"
      });
    }
  }

  return {
    added,
    contractChanged,
    removed: [...base.keys()].filter((name) => !head.has(name)),
    violations
  };
}
