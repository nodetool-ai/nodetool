/**
 * Registration sync — compiles a workflow's trigger nodes into durable
 * `trigger_registrations` rows.
 *
 * Runs whenever a workflow is saved. Every node whose type maps to a known
 * trigger kind gets one registration row, with the node's properties
 * snapshotted into `config_json`; rows for node ids no longer present in the
 * graph are deleted. Saving never arms a trigger: with `options.enabled`
 * omitted, existing rows keep the state the Activate toggle last set and new
 * rows start disabled. Passing `enabled` explicitly is the workflow-level
 * "active" switch; the start/stop endpoints in the jobs router flip a single
 * registration instead.
 */

import { randomBytes, createHash } from "node:crypto";
import { RunEvent, TriggerRegistration } from "@nodetool-ai/models";
import type { Workflow as WorkflowModel } from "@nodetool-ai/models";
import {
  CRON_TRIGGER_NODE_TYPE,
  TRIGGER_KIND_BY_NODE_TYPE
} from "@nodetool-ai/protocol";
import type { TriggerKind } from "@nodetool-ai/protocol";
import {
  DEFAULT_CRON_EXPR,
  DEFAULT_CRON_TZ,
  cronScheduleError
} from "@nodetool-ai/nodes-utils";
import {
  isObjectLike,
  isString
} from "../lib/wire-values.js";
import { anchorCronSchedule } from "./schedule-timing.js";

export { TRIGGER_KIND_BY_NODE_TYPE };
export type { TriggerKind };

/**
 * Prefix of the `last_error` that sync writes for a schedule it will not arm,
 * so a later save with a corrected schedule can tell its own message apart
 * from a failure that a run recorded.
 */
const INVALID_SCHEDULE_PREFIX = "Schedule not armed: ";

/** Keys `syncRegistrations` writes into a webhook registration's `config_json`
 * that are not part of the node's own property snapshot — stripped out
 * before diffing so token/secret rotation doesn't happen on every save. */
const WEBHOOK_BOOKKEEPING_KEYS = [
  "webhook_token",
  "webhook_secret",
  "webhook_secret_hash"
] as const;

interface SyncRegistrationsOptions {
  /**
   * Workflow-level activation state to apply to every synced row. Omit it on
   * the plain save path: existing rows then keep whatever the Activate toggle
   * last set, and new rows start disabled. Arming a trigger is always an
   * explicit act, never a side effect of saving the graph.
   */
  enabled?: boolean;
}

/**
 * A graph node's own property bag, following the same `properties`-then-
 * `data` precedence the kernel graph loader uses (`kernel/src/graph.ts`).
 */
function extractNodeProps(
  node: Record<string, unknown>
) {
  const properties = node.properties;
  if (isObjectLike(properties)) {
    return { ...(properties as Record<string, unknown>) };
  }
  const data = node.data;
  if (isObjectLike(data)) {
    return { ...(data as Record<string, unknown>) };
  }
  return {};
}

function hashSecret(secret: string): string {
  return createHash("sha256").update(secret).digest("hex");
}

function generateWebhookToken(): string {
  return randomBytes(24).toString("hex");
}

/**
 * The shared secret a sender puts in `x-webhook-secret`. It is kept in
 * plaintext because the user has to read it back to configure the sending
 * system — there is no show-once channel — and stored next to its digest so
 * the ingestion route can compare hashes in constant time without rehashing
 * per request.
 */
function generateWebhookSecret(): string {
  return randomBytes(32).toString("hex");
}

function stripWebhookBookkeeping(
  config: Record<string, unknown>
) {
  const rest = { ...config };
  for (const key of WEBHOOK_BOOKKEEPING_KEYS) {
    delete rest[key];
  }
  return rest;
}

/** True when the node-property portion of two config snapshots differs
 * (ignoring webhook token/secret bookkeeping, which sync owns). */
function configPropsChanged(
  previous: Record<string, unknown> | null,
  nextProps: Record<string, unknown>
): boolean {
  if (!previous) return true;
  const previousProps = stripWebhookBookkeeping(previous);
  return JSON.stringify(previousProps) !== JSON.stringify(nextProps);
}

interface TriggerNodeEntry {
  nodeId: string;
  kind: TriggerKind;
  props: Record<string, unknown>;
}

function collectTriggerNodes(workflow: WorkflowModel): TriggerNodeEntry[] {
  const nodes = workflow.graph?.nodes ?? [];
  const entries: TriggerNodeEntry[] = [];
  for (const rawNode of nodes) {
    const node = rawNode;
    const nodeId = isString(node.id) ? node.id : undefined;
    const nodeType = isString(node.type) ? node.type : undefined;
    if (!nodeId || !nodeType) continue;
    const kind = TRIGGER_KIND_BY_NODE_TYPE[nodeType];
    if (!kind) continue;
    const props = extractNodeProps(node);
    // The graph stores only the properties a user touched. Fill the cron
    // ones in so the registration is recognizably a cron schedule, and the
    // snapshot says what it will run on.
    entries.push({
      nodeId,
      kind,
      props:
        nodeType === CRON_TRIGGER_NODE_TYPE
          ? { cron_expr: DEFAULT_CRON_EXPR, cron_tz: DEFAULT_CRON_TZ, ...props }
          : props
    });
  }
  return entries;
}

async function emitTriggerRegistered(
  workflow: WorkflowModel,
  registration: TriggerRegistration
): Promise<void> {
  await RunEvent.appendEvent(
    workflow.id,
    "TriggerRegistered",
    {
      registration_id: registration.id,
      workflow_id: workflow.id,
      kind: registration.kind
    },
    registration.node_id
  );
}

/**
 * Reconcile a workflow's `trigger_registrations` rows against its current
 * graph. Returns the registrations that now exist for the workflow.
 */
export async function syncRegistrations(
  workflow: WorkflowModel,
  options: SyncRegistrationsOptions
): Promise<TriggerRegistration[]> {
  const triggerNodes = collectTriggerNodes(workflow);
  const triggerNodeIds = new Set(triggerNodes.map((n) => n.nodeId));

  const existing = await TriggerRegistration.findByWorkflow(workflow.id);
  const existingByNodeId = new Map(existing.map((r) => [r.node_id, r]));

  const results: TriggerRegistration[] = [];

  for (const entry of triggerNodes) {
    const current = existingByNodeId.get(entry.nodeId) ?? null;
    const wasEnabled = current ? current.enabled === 1 : false;

    let config: Record<string, unknown> = { ...entry.props };
    if (entry.kind === "webhook") {
      const previousConfig = current?.config_json ?? null;
      const webhookToken =
        (previousConfig?.webhook_token as string | undefined) ??
        generateWebhookToken();
      const webhookSecret =
        (previousConfig?.webhook_secret as string | undefined) ??
        generateWebhookSecret();
      config = {
        ...config,
        webhook_token: webhookToken,
        webhook_secret: webhookSecret,
        webhook_secret_hash: hashSecret(webhookSecret)
      };
    }

    const propsChanged = configPropsChanged(
      current?.config_json ?? null,
      entry.props
    );

    // A schedule the scheduler cannot compute is never armed. The popover
    // shows why in "Last error" instead of a trigger that is on and silent.
    const { cron_expr: cronExpr, cron_tz: cronTz } = entry.props;
    const scheduleError =
      entry.kind === "schedule" && isString(cronExpr)
        ? cronScheduleError(cronExpr, isString(cronTz) ? cronTz : DEFAULT_CRON_TZ)
        : null;
    const enabled = scheduleError ? false : (options.enabled ?? wasEnabled);

    let registration: TriggerRegistration;
    if (current) {
      current.kind = entry.kind;
      current.config_json = config;
      current.enabled = enabled ? 1 : 0;
      if (propsChanged) {
        current.cursor = null;
      }
      if (scheduleError) {
        current.last_error = INVALID_SCHEDULE_PREFIX + scheduleError;
      } else if (current.last_error?.startsWith(INVALID_SCHEDULE_PREFIX)) {
        current.last_error = null;
      }
      // A cron schedule counts from now when it is edited or switched on.
      if (propsChanged || (enabled && !wasEnabled)) {
        anchorCronSchedule(current, Date.now());
      }
      await current.save();
      registration = current;
    } else {
      registration = await TriggerRegistration.create<TriggerRegistration>({
        user_id: workflow.user_id,
        workflow_id: workflow.id,
        node_id: entry.nodeId,
        kind: entry.kind,
        config_json: config,
        enabled: enabled ? 1 : 0,
        cursor: null,
        last_error: scheduleError
          ? INVALID_SCHEDULE_PREFIX + scheduleError
          : null
      });
    }

    if (enabled && !wasEnabled) {
      await emitTriggerRegistered(workflow, registration);
    }

    results.push(registration);
  }

  // Registrations for nodes that no longer exist (or are no longer trigger
  // nodes) are removed outright — cursors only survive a disable, not a
  // deletion.
  for (const reg of existing) {
    if (!triggerNodeIds.has(reg.node_id)) {
      await reg.delete();
    }
  }

  return results;
}
