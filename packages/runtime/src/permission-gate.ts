/**
 * The permission gate contract: the mode, the category, the decision matrix,
 * the approval callback, and the context key a host publishes its gate under.
 *
 * It lives here rather than in `@nodetool-ai/agents` because the hosts that
 * run a workflow (`@nodetool-ai/execution`, the headless job runner) sit
 * below `agents` in the package graph and still have to set a gate on the
 * context they build. The ladder that reads the gate, the classification of
 * tool names, and the loops that gate through it stay in `agents`; this is
 * only what a host needs to say "this run is headless".
 *
 * Design: docs/AGENTS.md § "The permission gate",
 * packages/agents/AGENTS.md § "Where the permission gate is set".
 */

/**
 * ProcessingContext variable key under which a host publishes the
 * `PermissionGateOptions` every loop under it must gate through.
 *
 * The gate has to reach loops the host never constructs: an `AgentNode` a chat
 * turn started through `run_node`, a JS script, a sub-agent several levels
 * down. The context bag is the one channel all of them already carry, and
 * `ProcessingContext.copy()` shallow-copies it, so a child context shares the
 * host's gate object rather than a clone — which is what makes
 * `set_permission_mode` mid-turn reach a node that started before it
 * (invariant I-1).
 *
 * Read it with `gateFromContext` in `@nodetool-ai/agents`, never directly: a
 * context with no gate on it is a host that forgot to set one, and the answer
 * there is a gate that denies every call past read, not "ungated".
 */
export const PERMISSION_GATE_CONTEXT_KEY = "nodetool_permission_gate";

/** How risky a tool is, independent of the active mode. */
export type PermissionCategory = "read" | "write" | "execute" | "external";

/** The user-selected permission mode for a chat turn. */
export type PermissionMode = "plan" | "default" | "auto";

/** What the gate decides to do with a single call before any user prompt. */
export type PermissionDecision = "allow" | "ask" | "block";

/** The user's answer to an approval prompt. */
export type ApprovalDecision = "allow" | "allow_for_chat" | "deny";

/**
 * The matrix: `read` always runs; in `auto` everything runs; in `plan`
 * anything actionable is blocked; in `default` actionable calls ask.
 */
export function decidePermission(
  mode: PermissionMode,
  category: PermissionCategory
): PermissionDecision {
  if (category === "read") {
    return "allow";
  }
  if (mode === "auto") {
    return "allow";
  }
  if (mode === "plan") {
    return "block";
  }
  return "ask";
}

export interface ApprovalRequest {
  toolName: string;
  category: PermissionCategory;
  /** Tool arguments, with the reserved `_message` field stripped. */
  args: Record<string, unknown>;
  /** Resolved user-facing status (LLM `_message` or the tool's template). */
  message: string;
  /**
   * What the call will do, in plain sentences, for the approval dialog to ask
   * about. A high-risk code action supplies one (`execute_code`'s
   * `description`); most calls have none and the dialog shows `message`.
   */
  description?: string;
}

export type RequestApproval = (
  request: ApprovalRequest
) => Promise<ApprovalDecision>;

/**
 * One actionable call, as the security monitor sees it. Structurally the
 * `PendingAction` the monitor in `@nodetool-ai/agents` evaluates; declared
 * here so the gate carries no dependency on the monitor.
 */
export interface PermissionGateAction {
  /** Tool name about to run. */
  name: string;
  /** Permission category of the tool. */
  category: PermissionCategory;
  /** Tool arguments (with the reserved `_message` field already stripped). */
  args: Record<string, unknown>;
  /** Recent transcript text, used to evaluate user-intent clearing of SOFT blocks. */
  transcript?: string;
}

/**
 * What the monitor answers. The ladder reads `block`, `reason`, and the two
 * labels it prints; the monitor's own narrower unions satisfy this shape.
 */
export interface PermissionGateVerdict {
  block: boolean;
  reason: string;
  severity: string;
  tier: string;
}

/**
 * A guest clock the gate can stop while a prompt is open. Structurally the
 * sandbox's `SandboxClock`; declared here so the gate carries no dependency
 * on the sandbox.
 */
export interface PermissionGateClock {
  /** Stop the guest's budget until the returned function is called. */
  suspend(): () => void;
  /** Milliseconds suspended so far, including a suspension still open. */
  suspendedMs(): number;
}

export interface PermissionGateOptions {
  mode: PermissionMode;
  /**
   * Tool names the user has approved for the rest of the chat. Shared (by
   * reference) across a thread so "Allow for this chat" sticks between turns.
   */
  sessionAllow: Set<string>;
  /** Round-trips an approval prompt to the UI and resolves with the answer. */
  requestApproval: RequestApproval;
  /**
   * Opt-in LLM-judge consult. When set, every actionable (non-read) tool call
   * that the mode/approval logic would otherwise run is first vetted by the
   * monitor; a `block` verdict stops execution with a structured error. This
   * is a plain callback (NOT the monitor class) so the gate carries no
   * provider/LLM dependency. Default undefined → the gate behaves exactly as
   * before, byte-for-byte. Read-class tools are NEVER consulted, even when set.
   */
  securityMonitor?: (
    action: PermissionGateAction
  ) => Promise<PermissionGateVerdict>;
  /**
   * The sandbox clock a code action runs on, when the call comes from one. The
   * gate stops it for the length of an approval prompt or a monitor consult:
   * that wait is the user's (or another model's), not the guest program's, and
   * charging it to the action's wall clock kills the program that asked.
   */
  clock?: PermissionGateClock;
  /**
   * Optional accessor for the recent transcript text, forwarded into the
   * monitor's {@link PermissionGateAction.transcript} so SOFT-block
   * user-intent clearing has evidence to reason over. Defaults to undefined →
   * empty transcript. Only invoked when {@link securityMonitor} is set.
   */
  recentTranscript?: () => string;
}

/**
 * Why a headless host refuses an escalation, in one sentence naming it.
 *
 * Exported because two callers need the same words: the gate reports it when
 * it denies, and a host that runs headless on purpose (the CLI behind a pipe)
 * prints it once up front so the user is not left guessing why a later call
 * was refused.
 */
export function headlessDenialReason(hostName: string): string {
  return (
    `${hostName} runs without a user to ask, so calls the permission ladder ` +
    `escalates are denied.`
  );
}

/**
 * The gate for a host with nobody to ask: `auto`, denying every escalation.
 *
 * `decidePermission` allows read, write, execute and external outright in
 * `auto`, so this approver is reached only by a request the ladder itself
 * raises — a security-monitor consult, or a category that starts asking in
 * `auto` later. Denying is the only answer a host with no user can give
 * honestly: resolving `"allow"` would grant exactly what the escalation was
 * raised to withhold, and never resolving would hang the run (invariant I-4).
 *
 * `hostName` names the caller so the refusal says which host had no one to
 * ask, rather than only that something was refused.
 */
export function headlessGate(hostName: string): PermissionGateOptions {
  const reason = headlessDenialReason(hostName);
  const headlessDeny: RequestApproval = async (request) => {
    // Loud on the refusal (I-4): a denial nobody can see reads as a tool that
    // silently did nothing.
    console.warn(`Denied \`${request.toolName}\` without asking: ${reason}`);
    return "deny";
  };
  return {
    mode: "auto",
    sessionAllow: new Set<string>(),
    requestApproval: headlessDeny
  };
}
