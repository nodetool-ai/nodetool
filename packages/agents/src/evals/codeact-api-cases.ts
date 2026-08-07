/**
 * The nodetool-API slice of the codeact suite: cases whose toolbelts are
 * instrumented fakes named like real belt tools, so the executor lights up
 * the `nodetool.*` object model and the run exercises the platform API
 * surface instead of the toy worker belt.
 */

import { NODETOOL_API_NAMESPACE_TOOLS } from "../codeact/nodetool-api.js";
import type { CodeActEvalCase } from "./codeact-cases.js";
import { CODEACT_API_CORE_CASES } from "./codeact-api-core.js";
import { CODEACT_API_SURFACE_CASES } from "./codeact-api-surfaces.js";

export const CODEACT_API_EVAL_CASES: readonly CodeActEvalCase[] = [
  ...CODEACT_API_CORE_CASES,
  ...CODEACT_API_SURFACE_CASES
];

/**
 * `nodetool.*` namespaces no API case declares — the coverage test fails on
 * a non-empty answer, so dropping a namespace's last case is a loud change.
 */
export function uncoveredNodetoolApiNamespaces(
  cases: readonly CodeActEvalCase[] = CODEACT_API_EVAL_CASES
): string[] {
  const covered = new Set(cases.flatMap((c) => [...(c.namespaces ?? [])]));
  return Object.keys(NODETOOL_API_NAMESPACE_TOOLS).filter(
    (namespace) => !covered.has(namespace)
  );
}
