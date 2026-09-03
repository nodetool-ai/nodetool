/**
 * The `generations` capability module — the record of every media
 * generation, readable by the agent that asked for it.
 *
 * A generation capability (`generate_image`, `render_storyboard_clips`, …)
 * returns a `generation_id`. These five read that row, wait for it to settle
 * when the call was started in the background, stop it, and ask the provider
 * what it billed. Every read is scoped to the caller: `findForUser` and
 * `listGenerations` carry the user id in the WHERE, so an id belonging to
 * someone else reads as absent.
 *
 * Design: docs/media-generation-tracking-design.md § 10.
 */

import type { Prediction } from "@nodetool-ai/models";
import { generationRegistry } from "@nodetool-ai/runtime";
import type { CapabilityExport, CapabilityModule } from "./types.js";
import { userIdOf } from "../tools/mcp-tool-support.js";
import {
  listGenerationsSpec,
  getGenerationSpec,
  awaitGenerationSpec,
  cancelGenerationSpec,
  reconcileGenerationSpec,
  LIST_GENERATIONS_SCHEMA
} from "./generations.specs.js";
import { isNonEmptyString, isRecord, isString } from "../utils/type-guards.js";

export { LIST_GENERATIONS_SCHEMA } from "./generations.specs.js";

const DEFAULT_AWAIT_SECONDS = 300;
const MAX_AWAIT_SECONDS = 1800;
/** How often a cross-process wait re-reads the row. */
const AWAIT_POLL_MS = 5_000;

/** The shape every capability here returns for one generation. */
export interface GenerationRecord {
  generation_id: string;
  status: string;
  provider: string;
  model: string;
  capability: string | null;
  cost: number | null;
  currency: string | null;
  billing_unit: string | null;
  quantity: number | null;
  unit_price: number | null;
  price_source: string | null;
  asset_ids: string[];
  asset_uris: string[];
  started_at: string | null;
  completed_at: string | null;
  duration_seconds: number | null;
  /** The generation's own failure, if any. Not a tool failure. */
  generation_error: string | null;
  origin: {
    surface: string | null;
    thread_id: string | null;
    tool_call_id: string | null;
    job_id: string | null;
    node_id: string;
    workflow_id: string | null;
  };
  provider_request_id: string | null;
  reconcile: {
    reconciled_at: string | null;
    attempts: number;
    error: string | null;
    next_at: string | null;
  };
}

function metaString(
  metadata: Record<string, unknown> | null,
  key: string
): string | null {
  const value = metadata?.[key];
  return isString(value) ? value : null;
}

export function generationRecord(row: Prediction): GenerationRecord {
  const assetIds = Array.isArray(row.asset_ids)
    ? row.asset_ids.filter(isString)
    : [];
  return {
    generation_id: row.id,
    status: row.status,
    provider: row.provider,
    model: row.model,
    capability: row.capability ?? null,
    cost: row.cost,
    currency: row.currency,
    billing_unit: row.billing_unit,
    quantity: row.quantity,
    unit_price: row.unit_price,
    price_source: metaString(row.metadata, "price_source"),
    asset_ids: assetIds,
    asset_uris: assetIds.map((id) => `asset://${id}`),
    started_at: row.started_at,
    completed_at: row.completed_at,
    duration_seconds: row.duration,
    generation_error: row.error,
    origin: {
      surface: row.surface ?? null,
      thread_id: row.thread_id ?? null,
      tool_call_id: row.tool_call_id ?? null,
      job_id: row.job_id ?? null,
      node_id: row.node_id,
      workflow_id: row.workflow_id
    },
    provider_request_id: row.provider_request_id,
    reconcile: {
      reconciled_at: row.reconciled_at ?? null,
      attempts: row.reconcile_attempts ?? 0,
      error: metaString(row.metadata, "reconcile_error"),
      next_at: metaString(row.metadata, "reconcile_next_at")
    }
  };
}

function optionalString(value: unknown): string | undefined {
  return isNonEmptyString(value) ? value : undefined;
}

function bounded(value: unknown, fallback: number, max: number): number {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, max);
}

const listGenerations: CapabilityExport = {
  spec: listGenerationsSpec,
  impl: async (run, params) => {
    const { Prediction } = await import("@nodetool-ai/models");
    const [rows, next] = await Prediction.listGenerations(
      userIdOf(run.context),
      {
        status: optionalString(params["status"]),
        provider: optionalString(params["provider"]),
        capability: optionalString(params["capability"]),
        threadId: optionalString(params["thread_id"]),
        jobId: optionalString(params["job_id"]),
        since: optionalString(params["since"]),
        limit: bounded(params["limit"], 50, 500),
        startKey: optionalString(params["start_key"])
      }
    );
    return { generations: rows.map(generationRecord), next: next || null };
  }
};

const getGeneration: CapabilityExport = {
  spec: getGenerationSpec,
  impl: async (run, params) => {
    const { Prediction } = await import("@nodetool-ai/models");
    const id = String(params["generation_id"] ?? "");
    const row = await Prediction.findForUser(userIdOf(run.context), id);
    if (!row) return { error: `Generation ${id} was not found.` };
    return {
      ...generationRecord(row),
      parameters: isRecord(row.parameters) ? row.parameters : null,
      metadata: isRecord(row.metadata) ? row.metadata : null
    };
  }
};

const TERMINAL = new Set(["completed", "failed", "cancelled", "interrupted"]);

const awaitGeneration: CapabilityExport = {
  spec: awaitGenerationSpec,
  impl: async (run, params) => {
    const { Prediction } = await import("@nodetool-ai/models");
    const userId = userIdOf(run.context);
    const id = String(params["generation_id"] ?? "");
    const timeoutMs =
      bounded(params["timeout_seconds"], DEFAULT_AWAIT_SECONDS, MAX_AWAIT_SECONDS) *
      1000;
    const startedAt = Date.now();
    let row = await Prediction.findForUser(userId, id);
    if (!row) return { error: `Generation ${id} was not found.` };
    if (TERMINAL.has(row.status)) return generationRecord(row);

    // In this process the registry settles the moment the call returns; the
    // tracker's row write follows within the same tick, so one re-read after
    // the settle is enough. In another process, only the row can answer.
    const deadline = startedAt + timeoutMs;
    while (Date.now() < deadline) {
      const slice = Math.min(AWAIT_POLL_MS, deadline - Date.now());
      const outcome = generationRegistry.isRunning(id)
        ? await generationRegistry.wait(id, slice)
        : await new Promise<null>((resolve) =>
            setTimeout(() => resolve(null), slice)
          );
      if (outcome) {
        // Give the tracker's write a moment to land, then read the row.
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      row = await Prediction.findForUser(userId, id);
      if (!row) return { error: `Generation ${id} was not found.` };
      if (TERMINAL.has(row.status)) return generationRecord(row);
      if (run.context.signal?.aborted) break;
    }
    return {
      ...generationRecord(row),
      waited_seconds: Math.round((Date.now() - startedAt) / 1000)
    };
  }
};

const cancelGeneration: CapabilityExport = {
  spec: cancelGenerationSpec,
  impl: async (run, params) => {
    const { Prediction } = await import("@nodetool-ai/models");
    const userId = userIdOf(run.context);
    const id = String(params["generation_id"] ?? "");
    // The abort is what stops the provider call; the row is what the seam
    // closes when the call unwinds. When the call runs in another process the
    // registry knows nothing, so the row is closed here instead.
    const aborted = generationRegistry.cancel(id, userId);
    const flipped = aborted
      ? false
      : await Prediction.markCancelledIfRunning(id, userId);
    if (!aborted && !flipped) {
      return {
        generation_id: id,
        cancelled: false,
        error: `Generation ${id} is not running — it already settled, or it is not yours.`
      };
    }
    return {
      generation_id: id,
      status: "cancelled",
      aborted,
      note: aborted
        ? undefined
        : "The record is closed; the provider call runs in another process and finishes on its own."
    };
  }
};

const reconcileGenerationCapability: CapabilityExport = {
  spec: reconcileGenerationSpec,
  impl: async (run, params) => {
    const { reconcileGeneration } = await import("@nodetool-ai/execution");
    const id = String(params["generation_id"] ?? "");
    const outcome = await reconcileGeneration(
      id,
      userIdOf(run.context),
      (key) => run.context.getSecret(key)
    );
    if (!outcome.found) return { error: `Generation ${id} was not found.` };
    return {
      generation_id: id,
      before: outcome.before,
      after: outcome.after,
      reconciled: outcome.reconciled,
      reason: outcome.reason ?? null
    };
  }
};

export const GENERATION_CAPABILITIES: readonly CapabilityExport[] = [
  listGenerations,
  getGeneration,
  awaitGeneration,
  cancelGeneration,
  reconcileGenerationCapability
];

export const module: CapabilityModule = {
  module: "generations",
  exports: GENERATION_CAPABILITIES
};

export {
  listGenerations,
  getGeneration,
  awaitGeneration,
  cancelGeneration,
  reconcileGenerationCapability as reconcileGeneration
};
