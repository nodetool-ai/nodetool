/**
 * Poll adapter — the part of the scheduler that serves a trigger whose events
 * live in an external system that has to be asked, such as a mailbox.
 *
 * Such a trigger still compiles to a `schedule` registration, so its poll
 * interval, its due time and the editor's "next fire" readout come from
 * `schedule-timing.ts` unchanged. What differs is what happens when the
 * registration is due. A plain schedule delivers a tick and always starts a
 * run. A poll trigger asks its node's `pollTrigger` what is new, delivers one
 * input per event, and starts nothing when there is nothing new.
 *
 * The poll's position lives in the registration's `cursor` column, which
 * `registration-sync.ts` already clears when the node's properties change.
 * Each event's `input_id` is derived from the registration and the event's own
 * id, so a crash between delivering an input and saving the cursor replays the
 * same inputs on the next poll, and the wakeup service drops them as
 * duplicates instead of starting a second run.
 *
 * `last_fired_at` is the schedule's anchor, so every poll stamps it, whether it
 * found mail or failed. A failing poll therefore waits one interval before the
 * next attempt instead of hammering the remote server on every sweep.
 */

import { createLogger } from "@nodetool-ai/config";
import type { TriggerWakeupService } from "@nodetool-ai/kernel";
import { getSecret, TriggerRegistration, Workflow } from "@nodetool-ai/models";
import type {
  NodeClass,
  NodeRegistry,
  PollTrigger
} from "@nodetool-ai/node-sdk";
import { TRIGGER_MAX_CONSECUTIVE_FAILURES } from "@nodetool-ai/protocol";
import { disableTrigger } from "./settle.js";

// Stryker disable next-line StringLiteral: logger name is a diagnostic label, not a behavioural contract
const log = createLogger("nodetool.websocket.triggers.poll");

/** Prefix of a `last_error` the poll wrote, so a later good poll knows to clear it. */
export const POLL_ERROR_PREFIX = "Poll failed: ";

/** A trigger node's poller and the settings it needs. */
export interface TriggerPoller {
  poll: PollTrigger;
  requiredSettings: readonly string[];
}

/** Finds the poller for a registration, or `null` when it has none. */
export type TriggerPollerResolver = (
  registration: TriggerRegistration
) => Promise<TriggerPoller | null>;

/** Fired once per delivered event, like the scheduler's tick notification. */
export interface PollNotifyEvent {
  registrationId: string;
  inputId: string;
}

/**
 * Resolve pollers through a node registry. A registration belongs to a poller
 * when its trigger node's class declares `pollTrigger`. The node type is not
 * stored on the registration, so it is read from the workflow graph, and only
 * when some registered node class has a poller at all.
 */
export function createRegistryPollerResolver(
  registry: NodeRegistry
): TriggerPollerResolver {
  // Walking every registered class is cheap but not free, and the registry
  // only changes when a pack loads, so the answer is kept per revision.
  let pollableRevision = -1;
  let pollableClasses: NodeClass[] = [];
  const pollableNow = (): NodeClass[] => {
    if (pollableRevision !== registry.revision) {
      pollableClasses = registry
        .list()
        .map((type) => registry.getClass(type))
        .filter((cls): cls is NodeClass => cls?.pollTrigger !== undefined);
      pollableRevision = registry.revision;
    }
    return pollableClasses;
  };

  return async (registration) => {
    const pollable = pollableNow();
    if (pollable.length === 0) return null;

    const workflow = await Workflow.find(
      registration.user_id,
      registration.workflow_id
    );
    const node = workflow?.graph?.nodes?.find(
      (n) => n.id === registration.node_id
    );
    const cls = pollable.find((c) => c.nodeType === node?.type);
    if (!cls?.pollTrigger) return null;
    return {
      poll: cls.pollTrigger,
      requiredSettings: cls.requiredSettings ?? []
    };
  };
}

/** Registrations being polled right now. A slow poll must not be started twice. */
const polling = new Set<string>();

/** Whether a poll of this registration is still running. */
export function isPolling(registrationId: string): boolean {
  return polling.has(registrationId);
}

async function resolveSecrets(
  registration: TriggerRegistration,
  keys: readonly string[]
): Promise<Record<string, string>> {
  const secrets: Record<string, string> = {};
  for (const key of keys) {
    const value = await getSecret(key, registration.user_id);
    if (value) secrets[key] = value;
  }
  return secrets;
}

/**
 * Poll one due registration, start a run for each new event, and save the
 * cursor. Never throws: a failure is recorded on the registration.
 */
export async function pollRegistration(
  registration: TriggerRegistration,
  poller: TriggerPoller,
  wakeupService: TriggerWakeupService,
  nowMs: number,
  notify?: (event: PollNotifyEvent) => void
): Promise<void> {
  if (polling.has(registration.id)) return;
  polling.add(registration.id);
  try {
    let cursor = registration.cursor;
    let error: string | null = null;
    try {
      const secrets = await resolveSecrets(
        registration,
        poller.requiredSettings
      );
      const result = await poller.poll({
        properties: registration.config_json ?? {},
        cursor,
        secrets
      });

      // Events go out oldest first and the cursor moves with them, so a
      // delivery that fails leaves the cursor at the last event that made it.
      let delivered = 0;
      try {
        for (const event of result.events) {
          const inputId = `${registration.id}:${event.id}`;
          await wakeupService.deliverTriggerInput({
            runId: registration.workflow_id,
            nodeId: registration.node_id,
            inputId,
            payload: event.payload
          });
          cursor = event.cursor;
          delivered += 1;
          notify?.({ registrationId: registration.id, inputId });
        }
        cursor = result.cursor;
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `${reason} (${delivered} of ${result.events.length} events delivered)`
        );
      }
    } catch (err) {
      error =
        POLL_ERROR_PREFIX + (err instanceof Error ? err.message : String(err));
      log.warn(
        `Poll of registration ${registration.id} failed`,
        err instanceof Error ? err : new Error(String(err))
      );
    }

    await saveOutcome(registration, cursor, error, nowMs);
  } finally {
    polling.delete(registration.id);
  }
}

/**
 * Write what the poll did. The row is read again first, because the poll may
 * have taken seconds: a deleted registration stays deleted, a registration
 * whose properties changed meanwhile keeps the cursor `registration-sync`
 * cleared, and a trigger someone stopped stays stopped.
 */
async function saveOutcome(
  polled: TriggerRegistration,
  cursor: string | null,
  error: string | null,
  nowMs: number
): Promise<void> {
  const current = await TriggerRegistration.get<TriggerRegistration>(polled.id);
  if (!current) return;

  const sameConfig =
    JSON.stringify(current.config_json) === JSON.stringify(polled.config_json);
  const fields: Parameters<typeof TriggerRegistration.updateColumns>[1] = {
    last_fired_at: new Date(nowMs).toISOString()
  };
  if (sameConfig) fields.cursor = cursor;

  if (error !== null) {
    fields.last_error = error;
    fields.consecutive_failures = current.consecutive_failures + 1;
    if (fields.consecutive_failures >= TRIGGER_MAX_CONSECUTIVE_FAILURES) {
      disableTrigger(current, "failures");
      fields.enabled = current.enabled;
      fields.disabled_reason = current.disabled_reason;
    }
  } else if (current.last_error?.startsWith(POLL_ERROR_PREFIX)) {
    // The earlier failure was this poll's own. A run's failure is left for the
    // dispatcher, which settles it.
    fields.last_error = null;
    fields.consecutive_failures = 0;
  }

  await TriggerRegistration.updateColumns(polled.id, fields);
}
