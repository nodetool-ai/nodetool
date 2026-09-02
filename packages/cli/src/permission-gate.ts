/**
 * The CLI's end of the one permission ladder.
 *
 * Every host builds the same `PermissionGateOptions` and hands it to the same
 * `decidePermission` ladder (invariant I-1); what differs is who answers when
 * the ladder asks. In a terminal that is the person who typed the command, so
 * `requestApproval` prints the call on **stderr** — stdout carries the run's
 * result and must stay parseable — and reads one line back.
 *
 * Behind a pipe there is nobody to ask. The run then takes the headless gate
 * from `@nodetool-ai/agents`: `auto`, which the ladder lets through outright,
 * with every escalation denied and named. The refusal is printed once up
 * front rather than per call, so a user reading the transcript later knows why
 * an escalated call was refused instead of inferring it from the denial.
 */

import readline from "node:readline";
import {
  headlessDenialReason,
  headlessGate,
  type ApprovalDecision,
  type ApprovalRequest,
  type PermissionGateOptions,
  type PermissionMode
} from "@nodetool-ai/agents";

/** The modes `--permission-mode` accepts, in the order the help text lists. */
export const PERMISSION_MODE_NAMES = ["default", "auto", "plan"] as const;

function isPermissionMode(value: string): value is PermissionMode {
  return value === "default" || value === "auto" || value === "plan";
}

/**
 * Read a `--permission-mode` value, or throw naming what is accepted.
 *
 * An unrecognized mode is refused rather than falling back to a default: the
 * flag is the user's only say over what the model may do, and a typo that
 * silently ran `auto` would be the one failure this whole path exists to
 * prevent.
 */
export function parsePermissionMode(
  value: string | undefined
): PermissionMode | undefined {
  if (value === undefined) return undefined;
  const mode = value.trim().toLowerCase();
  if (isPermissionMode(mode)) return mode;
  throw new Error(
    `--permission-mode must be one of ${PERMISSION_MODE_NAMES.join(", ")} ` +
      `(got "${value}")`
  );
}

/** What a single keystroke at the prompt means. */
const ANSWERS: Record<string, ApprovalDecision> = {
  y: "allow",
  yes: "allow",
  n: "deny",
  no: "deny",
  a: "allow_for_chat"
};

export interface CliPermissionGateOptions {
  /** Names this host in the refusal a headless run prints and returns. */
  hostName: string;
  /** The requested mode. Undefined resolves from whether anyone can answer. */
  mode?: PermissionMode;
  /** Whether a person is at the terminal to answer a prompt. */
  interactive: boolean;
  /**
   * Where the notice and the prompts go, one line per call, no trailing
   * newline. Defaults to stderr; `--json` routes it into the event stream so
   * that stream stays one JSON object per line.
   */
  write?: (text: string) => void;
  /** Where an answer is read from. Defaults to stdin. */
  input?: NodeJS.ReadableStream;
}

/**
 * Pull one line at a time from `input`, opening the reader on first use.
 *
 * Lazy because `agent run` reads a piped objective off stdin itself: opening
 * a reader a headless run never prompts through would consume it.
 */
function lineReader(
  input: NodeJS.ReadableStream
): () => Promise<string | null> {
  let lines: AsyncIterator<string> | null = null;
  return async () => {
    if (lines === null) {
      lines = readline
        .createInterface({ input, terminal: false })
        [Symbol.asyncIterator]();
    }
    const next = await lines.next();
    return next.done === true ? null : next.value;
  };
}

/**
 * The gate a CLI run gates through: a terminal prompt, or the headless gate.
 *
 * `sessionAllow` is created here, once per run, and shared by reference with
 * every loop the run starts — the belt, each delegated capability run, and the
 * context every child reads its gate off. That sharing is what makes `a`
 * ("allow for the rest of this session") outlive the call that answered it:
 * the ladder records the tool name in this Set, and the next loop consults the
 * same one rather than a copy.
 */
export function createCliPermissionGate(
  options: CliPermissionGateOptions
): PermissionGateOptions {
  const write =
    options.write ??
    ((text: string): void => {
      process.stderr.write(`${text}\n`);
    });
  const mode = options.mode ?? (options.interactive ? "default" : "auto");

  if (!options.interactive || mode === "auto") {
    // Once per run, not per call: the reason is the same every time, and a
    // line repeated per denied call buries the calls themselves.
    write(headlessDenialReason(options.hostName));
    // The requested mode still governs the ladder — a piped `--permission-mode
    // plan` blocks what plan mode blocks. Only the approver changes, and a
    // host with no user denies (invariant I-4).
    return { ...headlessGate(options.hostName), mode };
  }

  const readLine = lineReader(options.input ?? process.stdin);
  const askOnTerminal = async (
    request: ApprovalRequest
  ): Promise<ApprovalDecision> => {
    for (;;) {
      write(
        `\n${request.message}\n  ${request.toolName} (${request.category})` +
          `\n  allow? [y] yes  [n] no  [a] yes for the rest of this session`
      );
      const line = await readLine();
      // Stdin closed mid-run: there is no longer anyone to ask, so the answer
      // is the one a host with no user gives.
      if (line === null) return "deny";
      const answer = ANSWERS[line.trim().toLowerCase()];
      if (answer !== undefined) return answer;
    }
  };

  return {
    mode,
    sessionAllow: new Set<string>(),
    requestApproval: askOnTerminal
  };
}
