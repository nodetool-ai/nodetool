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
import { TRIGGER_KIND_BY_NODE_TYPE } from "@nodetool-ai/protocol";
import type { TriggerKind } from "@nodetool-ai/protocol";

export { TRIGGER_KIND_BY_NODE_TYPE };
export type { TriggerKind };

/** Keys `syncRegistrations` writes into a webhook registration's `config_json`
 * that are not part of the node's own property snapshot — stripped out
 * before diffing so token/secret rotation doesn't happen on every save. */
const WEBHOOK_BOOKKEEPING_KEYS = [
  "webhook_token",
  "webhook_secret",
  "webhook_secret_hash"
] as const;

export interface SyncRegistrationsOptions {
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
  if (properties && typeof properties === "object") {
    return { ...(properties as Record<string, unknown>) };
  }
  const data = node.data;
  if (data && typeof data === "object") {
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
    const node = rawNode as Record<string, unknown>;
    const nodeId = typeof node.id === "string" ? node.id : undefined;
    const nodeType = typeof node.type === "string" ? node.type : undefined;
    if (!nodeId || !nodeType) continue;
    const kind = TRIGGER_KIND_BY_NODE_TYPE[nodeType];
    if (!kind) continue;
    entries.push({ nodeId, kind, props: extractNodeProps(node) });
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

    const enabled = options.enabled ?? wasEnabled;

    let registration: TriggerRegistration;
    if (current) {
      current.kind = entry.kind;
      current.config_json = config;
      current.enabled = enabled ? 1 : 0;
      if (propsChanged) {
        current.cursor = null;
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
        cursor: null
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
