/**
 * Coverage guarantees for the nodetool-API codeact cases: every `nodetool.*`
 * namespace keeps at least one case, ids stay unique across the whole suite,
 * and each case's required tools exist on the belt it builds.
 */

import { describe, expect, it } from "vitest";
import { NODETOOL_API_NAMESPACE_TOOLS } from "../src/codeact/nodetool-api.js";
import {
  CODEACT_EVAL_CASES,
  createCodeActRecorder
} from "../src/evals/codeact-cases.js";
import {
  CODEACT_API_EVAL_CASES,
  uncoveredNodetoolApiNamespaces
} from "../src/evals/codeact-api-cases.js";

describe("codeact API case coverage", () => {
  it("covers every nodetool.* namespace", () => {
    expect(uncoveredNodetoolApiNamespaces()).toEqual([]);
  });

  it("declares only real namespaces", () => {
    const known = new Set(Object.keys(NODETOOL_API_NAMESPACE_TOOLS));
    for (const c of CODEACT_API_EVAL_CASES) {
      for (const ns of c.namespaces ?? []) {
        expect(known, `${c.id} declares unknown namespace ${ns}`).toContain(ns);
      }
    }
  });

  it("keeps case ids unique across the whole codeact suite", () => {
    const ids = [...CODEACT_EVAL_CASES, ...CODEACT_API_EVAL_CASES].map(
      (c) => c.id
    );
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("requires only tools its belt carries, and lights its namespaces up", () => {
    for (const c of CODEACT_API_EVAL_CASES) {
      const belt = new Set(
        (c.createTools?.(createCodeActRecorder()) ?? []).map((t) => t.name)
      );
      for (const name of c.expect.requiredTools ?? []) {
        expect(belt, `${c.id} requires missing tool ${name}`).toContain(name);
      }
      for (const ns of c.namespaces ?? []) {
        const lit = NODETOOL_API_NAMESPACE_TOOLS[ns].some((t) => belt.has(t));
        expect(lit, `${c.id}: belt lights no tool of namespace ${ns}`).toBe(
          true
        );
      }
    }
  });
});
