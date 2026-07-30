/**
 * Client state-machine conformance (docs/RELIABILITY_ARCHITECTURE.md §6
 * "State transitions"): the client `WebSocketManager` transitions only along
 * its declared state machine.
 *
 * `CLIENT_STATE_TRANSITIONS` below is a data copy of
 * `web/src/lib/websocket/WebSocketManager.ts`'s `STATE_TRANSITIONS` table
 * (~line 95) — the reliability harness package cannot depend on `web/`, so
 * a real change to the client's state machine must be mirrored here too;
 * `state-machine.test.ts` fixtures pin the exact transitions so a drift is
 * at least visible in review even though nothing enforces the two files stay
 * identical automatically.
 *
 * Operates on `RunRecord.transitions` (additive over C1's shape, see
 * `record.ts`) — a driver that never touches a real client connection (e.g.
 * the kernel driver) produces none, and this module reports no violations
 * rather than treating absence itself as a violation.
 */
import type { RecordedTransition, RunRecord } from "../record.js";
import type { Violation } from "./types.js";

interface DeclaredTransition {
  from: readonly string[];
  to: string;
}

/** Mirrors `WebSocketManager.ts`'s `STATE_TRANSITIONS` exactly. */
export const CLIENT_STATE_TRANSITIONS: Readonly<
  Record<string, DeclaredTransition>
> = {
  connect: { from: ["disconnected", "failed"], to: "connecting" },
  connected: { from: ["connecting", "reconnecting"], to: "connected" },
  disconnect: {
    from: ["connected", "connecting", "reconnecting"],
    to: "disconnecting"
  },
  disconnected: {
    from: ["disconnecting", "connecting", "connected", "reconnecting"],
    to: "disconnected"
  },
  reconnect: { from: ["disconnected", "failed"], to: "reconnecting" },
  failed: {
    from: ["connecting", "reconnecting", "disconnected"],
    to: "failed"
  }
};

function checkOne(
  transition: RecordedTransition,
  index: number,
  priorTo: string | undefined
): Violation[] {
  const violations: Violation[] = [];
  const declared = CLIENT_STATE_TRANSITIONS[transition.action];

  if (!declared) {
    violations.push({
      invariant: "state-machine.unknown-action",
      message: `transition #${index} uses action "${transition.action}", which the declared state machine has no entry for`,
      details: { index, action: transition.action }
    });
    return violations;
  }

  if (!declared.from.includes(transition.from)) {
    violations.push({
      invariant: "state-machine.invalid-from",
      message:
        `action "${transition.action}" (transition #${index}) is not valid ` +
        `from state "${transition.from}" — declared "from" states are: ` +
        `${declared.from.join(", ")}`,
      details: {
        index,
        action: transition.action,
        from: transition.from,
        declaredFrom: declared.from
      }
    });
  }

  if (declared.to !== transition.to) {
    violations.push({
      invariant: "state-machine.invalid-to",
      message:
        `action "${transition.action}" (transition #${index}) declares "to": ` +
        `"${declared.to}" but the record has "to": "${transition.to}"`,
      details: {
        index,
        action: transition.action,
        to: transition.to,
        declaredTo: declared.to
      }
    });
  }

  if (priorTo !== undefined && priorTo !== transition.from) {
    violations.push({
      invariant: "state-machine.chain-gap",
      message:
        `transition #${index} starts from "${transition.from}" but the ` +
        `previous recorded transition ended in "${priorTo}"`,
      details: { index, expectedFrom: priorTo, actualFrom: transition.from }
    });
  }

  return violations;
}

export function checkStateMachine(record: RunRecord): Violation[] {
  const transitions = record.transitions;
  if (!transitions || transitions.length === 0) return [];

  const violations: Violation[] = [];
  let priorTo: string | undefined;
  transitions.forEach((transition, index) => {
    violations.push(...checkOne(transition, index, priorTo));
    priorTo = transition.to;
  });
  return violations;
}
