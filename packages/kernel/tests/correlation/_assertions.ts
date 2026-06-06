/**
 * Algebraic assertions for the correlation conformance suite.
 *
 * The principle: tests should read as algebra, not as bug regressions.
 * `forward preserves`, `iteration extends`, `aggregate collapses`,
 * `join matches`, `drop skips`, `close finalizes`, `limits bound`,
 * `flag isolates`.
 *
 * Helpers below give each algebra rule a one-liner so a test reads like:
 *
 *     assertSameLineage(left, right);
 *     assertHasRoot(env, "fe:items");
 *     assertRootIndex(env, "fe:items", 2);
 *     assertRootCollapsed(out, "fe:items");
 *     assertSiblingOutputsShareToken(zipEnvelopes, "zip:zip");
 *
 * Each helper throws via Vitest `expect` so test failure points to the
 * specific algebra rule that was violated, not to a derived value.
 */

import { expect } from "vitest";
import type { CorrelationLineage } from "@nodetool-ai/protocol";
import type { MessageEnvelope } from "../../src/inbox.js";
import type { CorrelationAnalysisResult } from "../../src/correlation-analysis.js";
import type { NodeInbox } from "../../src/inbox.js";

/**
 * Two envelopes share the same correlation lineage (token-for-token, set
 * equality on roots).
 */
export function assertSameLineage(
  a: MessageEnvelope,
  b: MessageEnvelope
): void {
  expect(Object.keys(a.correlation_lineage).sort()).toEqual(
    Object.keys(b.correlation_lineage).sort()
  );
  for (const root of Object.keys(a.correlation_lineage)) {
    expect(b.correlation_lineage[root]?.index).toBe(
      a.correlation_lineage[root]?.index
    );
  }
}

/** Envelope's lineage contains `root`. */
export function assertHasRoot(env: MessageEnvelope, root: string): void {
  expect(
    env.correlation_lineage[root],
    `expected envelope to carry root "${root}" (lineage: ${JSON.stringify(env.correlation_lineage)})`
  ).toBeDefined();
}

/** Envelope's lineage carries `root=index`. */
export function assertRootIndex(
  env: MessageEnvelope,
  root: string,
  index: number
): void {
  assertHasRoot(env, root);
  expect(env.correlation_lineage[root]!.index).toBe(index);
}

/** Envelope's lineage does NOT contain `root` (collapsed by aggregate). */
export function assertRootCollapsed(
  env: MessageEnvelope,
  root: string
): void {
  expect(
    env.correlation_lineage[root],
    `expected root "${root}" to be collapsed; got ${JSON.stringify(env.correlation_lineage)}`
  ).toBeUndefined();
}

/** Analyzer rejected nothing — graph is well-formed under correlation. */
export function assertNoIncomparableScopes(
  analysis: CorrelationAnalysisResult
): void {
  expect(
    analysis.issues.filter((i) =>
      /independent iteration sources/.test(i.message)
    )
  ).toEqual([]);
}

/** A run failed at graph load with the design's join-required error. */
export function assertJoinRejected(errorMessage: string | undefined): void {
  expect(errorMessage ?? "").toMatch(
    /independent iteration sources.*Add Zip or Cross/
  );
}

/**
 * No pending data left undelivered at the end of a run. Every per-handle
 * buffer must be drained and every upstream marked done.
 */
export function assertNoDanglingPendingKeys(
  inboxes: Iterable<NodeInbox>
): void {
  for (const inbox of inboxes) {
    expect(
      inbox.hasPendingWork(),
      "inbox still has pending work; close barrier likely missing"
    ).toBe(false);
  }
}

/**
 * Sibling output handles produced by an `emitGroup` share **one** minted
 * token for the named iteration root. Pass the *parallel* envelope
 * arrays — one per sibling handle, all of equal length — and the root id
 * that should be identical at each pair index.
 */
export function assertSiblingOutputsShareToken(
  siblings: Record<string, MessageEnvelope[]>,
  root: string
): void {
  const names = Object.keys(siblings);
  expect(names.length, "expected at least 2 sibling handles").toBeGreaterThanOrEqual(2);
  const reference = siblings[names[0]];
  for (const name of names.slice(1)) {
    const other = siblings[name];
    expect(other).toHaveLength(reference.length);
  }
  for (let i = 0; i < reference.length; i++) {
    const idx = reference[i].correlation_lineage[root]?.index;
    expect(
      idx,
      `expected root "${root}" on sibling "${names[0]}"[${i}]`
    ).toBeDefined();
    for (const name of names.slice(1)) {
      const other = siblings[name][i];
      expect(other.correlation_lineage[root]?.index).toBe(idx);
    }
  }
}

/**
 * `lineage_scope_closed` was recorded for `(edgeId, parentLineage, root)`
 * on the given inbox handle.
 */
export function assertScopeClosed(
  inbox: NodeInbox,
  edgeId: string,
  parentLineage: CorrelationLineage,
  closedRoot: string
): void {
  // We project against an unknown scope here; callers pass an empty
  // lineage when the design's parent_lineage is empty. The inbox keys by
  // canonical projection, but for these conformance tests the parent is
  // usually empty so the key is "".
  const parentKey =
    Object.keys(parentLineage).length === 0
      ? ""
      : Object.keys(parentLineage)
          .sort()
          .map((k) => `${k}=${parentLineage[k].index}`)
          .join(",");
  expect(
    inbox.isScopeClosedFor(edgeId, parentKey, closedRoot),
    `expected scope_closed for (${edgeId}, ${parentKey}, ${closedRoot})`
  ).toBe(true);
}

/**
 * `lineage_done` was recorded for `(edgeId, projectedKey)`.
 */
export function assertLineageDone(
  inbox: NodeInbox,
  edgeId: string,
  projectedKey: string
): void {
  expect(
    inbox.isEdgeDoneFor(edgeId, projectedKey),
    `expected lineage_done for (${edgeId}, "${projectedKey}")`
  ).toBe(true);
}

/**
 * The values delivered to a sink, in arrival order. Use the parallel
 * `byHandle` if a node captured multiple handles.
 */
export function valuesFrom(envelopes: MessageEnvelope[]): unknown[] {
  return envelopes.map((e) => e.data);
}

/**
 * Collect token indices at a given root across a list of envelopes.
 */
export function indicesAt(
  envelopes: MessageEnvelope[],
  root: string
): number[] {
  return envelopes.map((e) => {
    const t = e.correlation_lineage[root];
    if (!t) {
      throw new Error(`envelope missing root ${root}: ${JSON.stringify(e.correlation_lineage)}`);
    }
    return t.index;
  });
}
