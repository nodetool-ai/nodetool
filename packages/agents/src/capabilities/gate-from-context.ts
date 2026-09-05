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
import type {
  PermissionGateOptions,
  RequestApproval
} from "../tools/tool-permissions.js";
import { PERMISSION_GATE_CONTEXT_KEY } from "../types.js";

const log = createLogger("nodetool.agents.gate-from-context");

/**
 * Hosts already reported for running with no gate on their context. Every
 * host sets one — a workflow run sets the headless gate at its choke point
 * (`buildWorkspaceExecutionContext`, `ExecutionSession.create`) — so a loop
 * that finds none is a bug in a host, worth one error line per host per
 * process, not one per call.
 */
const reportedGateless = new Set<string>();

function reportGateless(hostName: string, reason: string): void {
  if (reportedGateless.has(hostName)) {
    return;
  }
  reportedGateless.add(hostName);
  log.error(
    `${hostName}: ${reason}; denying every call past read. Every host must ` +
      "set PERMISSION_GATE_CONTEXT_KEY on the run's context — a headless " +
      "one sets headlessGate(hostName) from @nodetool-ai/runtime."
  );
}

/**
 * The gate for a loop whose host set none: fail closed.
 *
 * `default` mode lets read-class calls through and asks for everything else,
 * and the approver answers `deny`, so the loop can still look but not act.
 * Returning the headless `auto` gate here would grant every category to a
 * host that never decided to, which is how a forgotten gate used to run
 * silently unattended.
 */
function absentGate(hostName: string): PermissionGateOptions {
  const deny: RequestApproval = async (request) => {
    log.warn(
      `Denied \`${request.toolName}\`: ${hostName} set no permission gate ` +
        "on its context."
    );
    return "deny";
  };
  return {
    mode: "default",
    sessionAllow: new Set<string>(),
    requestApproval: deny
  };
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
  if (typeof value !== "object" || value === null) {
    return false;
  }
  if (!("mode" in value && "sessionAllow" in value)) {
    return false;
  }
  if (!("requestApproval" in value)) {
    return false;
  }
  return (
    (value.mode === "plan" ||
      value.mode === "default" ||
      value.mode === "auto") &&
    value.sessionAllow instanceof Set &&
    typeof value.requestApproval === "function"
  );
}

/**
 * The gate a host put on the context, or a gate that denies every call past
 * read when none did.
 *
 * Absent means "a host forgot", not "anything goes": a loop that built its own
 * ungated run is how a chat in plan mode could mutate through an `AgentNode`,
 * and a headless host that means `auto` says so by setting `headlessGate`. A
 * value that is present but not a gate gets the same answer — handing the
 * ladder a half-built object would decide permissions off whatever fields
 * happened to survive.
 */
export function gateFromContext(
  context: PermissionGateContext | undefined | null,
  hostName: string
): PermissionGateOptions {
  if (typeof context?.get !== "function") {
    reportGateless(hostName, "no context to read a permission gate from");
    return absentGate(hostName);
  }
  const value = context.get<unknown>(PERMISSION_GATE_CONTEXT_KEY);
  if (isPermissionGate(value)) {
    return value;
  }
  reportGateless(
    hostName,
    value === undefined
      ? "no permission gate on the context"
      : "the value under PERMISSION_GATE_CONTEXT_KEY is not a permission gate"
  );
  return absentGate(hostName);
}
