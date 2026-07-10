/**
 * Registration sync — reconcile a workflow's trigger nodes with the durable
 * `trigger_registrations` rows that back host-owned ingestion adapters.
 *
 * Called after a workflow is saved. It is derived state: a sync failure must
 * never fail the save, so callers wrap this in a try/catch and log.
 */

import { createHash, randomUUID } from "node:crypto";
import { TriggerRegistration, RunEvent } from "@nodetool-ai/models";
import type { Workflow } from "@nodetool-ai/models";
import { createLogger } from "@nodetool-ai/config";

const log = createLogger("nodetool.websocket.triggers.registration-sync");

/** Trigger node type → registration kind. `Wait` is a delay, not a trigger. */
const KIND_BY_NODE_TYPE: Record<string, string> = {
  "nodetool.triggers.WebhookTrigger": "webhook",
  "nodetool.triggers.IntervalTrigger": "schedule",
  "nodetool.triggers.FileWatchTrigger": "file_watch",
  "nodetool.triggers.ManualTrigger": "manual"
};

interface TriggerNode {
  nodeId: string;
  kind: string;
  data: Record<string, unknown>;
}

function detectTriggerNodes(workflow: Workflow): TriggerNode[] {
  const nodes = workflow.graph?.nodes ?? [];
  const found: TriggerNode[] = [];
  for (const raw of nodes) {
    const node = raw as Record<string, unknown>;
    const type = typeof node.type === "string" ? node.type : "";
    if (!type.includes("triggers.")) continue;
    if (type === "nodetool.triggers.Wait") continue;
    const kind = KIND_BY_NODE_TYPE[type];
    if (!kind) {
      log.debug(`Skipping unknown trigger node type: ${type}`);
      continue;
    }
    const nodeId = typeof node.id === "string" ? node.id : "";
    if (!nodeId) continue;
    const data =
      node.data && typeof node.data === "object"
        ? (node.data as Record<string, unknown>)
        : {};
    found.push({ nodeId, kind, data });
  }
  return found;
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Build the config snapshot stored on a registration. Webhook nodes get a
 * stable URL token (kept across re-syncs, regenerated only if absent) and a
 * hashed secret — the plaintext secret is never persisted.
 */
function buildConfig(
  node: TriggerNode,
  existing: TriggerRegistration | undefined
): Record<string, unknown> {
  if (node.kind !== "webhook") {
    return { ...node.data };
  }

  const { secret, ...rest } = node.data;
  const existingToken = (existing?.config_json as Record<string, unknown> | null)
    ?.token;
  const token =
    typeof existingToken === "string" && existingToken.length > 0
      ? existingToken
      : randomUUID();

  const config: Record<string, unknown> = { ...rest, token };
  const secretStr = secret == null ? "" : String(secret);
  if (secretStr !== "") {
    config.secret_hash = sha256Hex(secretStr);
  }
  return config;
}

/** Deterministic JSON with sorted keys, for structural comparison. */
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (val && typeof val === "object" && !Array.isArray(val)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(val as Record<string, unknown>).sort()) {
        sorted[k] = (val as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return val;
  });
}

async function emitRegisteredEvent(reg: TriggerRegistration): Promise<void> {
  try {
    // Trigger-level events are keyed by workflow_id (there is no run yet), the
    // same convention the manual-dispatch path uses.
    await RunEvent.appendEvent(
      reg.workflow_id,
      "TriggerRegistered",
      { kind: reg.kind, node_id: reg.node_id },
      reg.node_id
    );
  } catch (error) {
    log.warn(
      `Failed to emit TriggerRegistered event for ${reg.workflow_id}/${reg.node_id}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Reconcile the workflow's trigger nodes with `trigger_registrations`:
 * upsert one row per trigger node, delete rows whose node is gone, reset the
 * cursor on config change, and disable (never delete) all rows when
 * `opts.enabled === false`.
 */
export async function syncRegistrations(
  workflow: Workflow,
  opts: { enabled?: boolean } = {}
): Promise<void> {
  const triggerNodes = detectTriggerNodes(workflow);
  const existing = await TriggerRegistration.findByWorkflow(workflow.id);
  const existingByNode = new Map(existing.map((r) => [r.node_id, r]));
  const seen = new Set<string>();

  const disable = opts.enabled === false;
  const enable = opts.enabled === true;

  for (const node of triggerNodes) {
    seen.add(node.nodeId);
    const current = existingByNode.get(node.nodeId);
    const config = buildConfig(node, current);

    if (current) {
      const changed = canonical(current.config_json) !== canonical(config);
      current.kind = node.kind;
      if (changed) {
        current.config_json = config;
        current.cursor = null;
      }
      if (disable) current.enabled = 0;
      else if (enable) current.enabled = 1;
      await current.save();
    } else {
      const reg = new TriggerRegistration({
        user_id: workflow.user_id,
        workflow_id: workflow.id,
        node_id: node.nodeId,
        kind: node.kind,
        config_json: config,
        enabled: disable ? 0 : 1
      });
      await reg.save();
      if (reg.enabled === 1) await emitRegisteredEvent(reg);
    }
  }

  for (const reg of existing) {
    if (!seen.has(reg.node_id)) {
      await reg.delete();
    }
  }
}
