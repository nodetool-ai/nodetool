/**
 * Reading the run's permission gate off the context bag.
 *
 * A host sets `PERMISSION_GATE_CONTEXT_KEY` once, at the top of a run; every
 * loop under it — an `AgentNode` reached through `run_node`, a JS script, a
 * sub-agent — reads it here instead of building a gate of its own. That is how
 * one ladder covers hosts that never see each other (invariant I-1).
 *
 * This lives in `capabilities/`, not in `tools/tool-permissions.ts`, because
 * the import edge stays one-way: capabilities import the classification map,
 * never the reverse (see `gate-tools.ts` for what the reverse edge did to the
 * bundled backend).
 */

import { createLogger } from "@nodetool-ai/config";
import {
  headlessGate,
  type PermissionGateOptions
} from "../tools/tool-permissions.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../types.js";

const log = createLogger("nodetool.agents.gate-from-context");

/**
 * Hosts already reported for running with no gate on their context. The
 * headless gate is `auto`, so a host that forgot to set one gets every
 * category allowed with nobody to ask — worth one error line per host per
 * process, not one per call.
 */
const reportedGateless = new Set<string>();

function reportGateless(hostName: string, reason: string): void {
  if (reportedGateless.has(hostName)) return;
  reportedGateless.add(hostName);
  log.error(
    `${hostName}: ${reason}; falling back to the headless gate (mode auto, ` +
      "every escalation denied). A host with a user to ask must set " +
      "PERMISSION_GATE_CONTEXT_KEY on the run's context."
  );
}

/**
 * Minimal reader for the context bag, so this stays free of a context import.
 *
 * `get` is optional because the callers are nodes and hosts that accept a
 * partial context — a test double, or a node invoked with none at all. A
 * context that cannot answer has no gate on it, which is the same answer as a
 * context that answers with nothing.
 */
interface PermissionGateContext {
  get?<T = unknown>(key: string, defaultValue?: T): T;
}

/** The three fields the ladder reads on every gated call. */
function isPermissionGate(value: unknown): value is PermissionGateOptions {
  if (typeof value !== "object" || value === null) return false;
  if (!("mode" in value && "sessionAllow" in value)) return false;
  if (!("requestApproval" in value)) return false;
  return (
    (value.mode === "plan" ||
      value.mode === "default" ||
      value.mode === "auto") &&
    value.sessionAllow instanceof Set &&
    typeof value.requestApproval === "function"
  );
}

/**
 * The gate a host put on the context, or the headless gate when none did.
 *
 * Absent means "nobody is watching this run", not "anything goes": a loop that
 * built its own ungated run is how a chat in plan mode could mutate through an
 * `AgentNode`. A value that is present but not a gate gets the same answer —
 * handing the ladder a half-built object would decide permissions off whatever
 * fields happened to survive.
 */
export function gateFromContext(
  context: PermissionGateContext | undefined | null,
  hostName: string
): PermissionGateOptions {
  if (typeof context?.get !== "function") {
    reportGateless(hostName, "no context to read a permission gate from");
    return headlessGate(hostName);
  }
  const value = context.get<unknown>(PERMISSION_GATE_CONTEXT_KEY);
  if (isPermissionGate(value)) return value;
  reportGateless(
    hostName,
    value === undefined
      ? "no permission gate on the context"
      : "the value under PERMISSION_GATE_CONTEXT_KEY is not a permission gate"
  );
  return headlessGate(hostName);
}
