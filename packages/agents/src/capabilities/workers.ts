/**
 * The `workers` capability module — see and pause rented GPU workers.
 *
 * A worker bills by the minute, so a run may find one that is still billing
 * and pause it. Renting and destroying stay out of this module: one spends
 * money and the other deletes the volume.
 *
 * The registry is one per install and spends the operator's provider keys, so
 * these capabilities follow the tRPC router's production rule. Results omit the
 * connection URL, because the proxy URL of a ComfyUI pod is its only secret.
 */

import type { WorkerInstance } from "@nodetool-ai/models";

import type { CapabilityExport, CapabilityModule } from "./types.js";
import {
  getWorkerStatusSpec,
  listWorkersSpec,
  stopWorkerSpec
} from "./workers.specs.js";

const SHORT_ID_LENGTH = 12;

const isProductionServer = (): boolean =>
  process.env["NODETOOL_ENV"] === "production";

async function workerManager() {
  if (isProductionServer()) {
    throw new Error("Remote workers are disabled in production.");
  }
  const { WorkerManager } = await import("@nodetool-ai/compute");
  return new WorkerManager();
}

/** Resolve a full id or an exact 12-character prefix that has one match. */
function resolveWorker(
  instances: readonly WorkerInstance[],
  value: unknown
): WorkerInstance {
  const id = typeof value === "string" ? value.trim() : "";
  const exact = instances.find((instance) => instance.id === id);
  if (exact) {
    return exact;
  }
  const matches =
    id.length === SHORT_ID_LENGTH
      ? instances.filter((instance) => instance.id.slice(0, SHORT_ID_LENGTH) === id)
      : [];
  if (matches.length > 1) {
    throw new Error(`Worker id '${id}' is ambiguous. Use the full id.`);
  }
  if (matches.length === 0) {
    throw new Error(`Worker not found: '${id}'. Call list_workers for the ids.`);
  }
  return matches[0];
}

function summarize(instance: WorkerInstance) {
  return {
    id: instance.id,
    profile_name: instance.profile_name,
    target: instance.target,
    status: instance.status,
    hourly_cost_usd: instance.estimated_cost_usd,
    created_at: instance.created_at,
    last_activity_at: instance.last_activity_at
  };
}

const listWorkers: CapabilityExport = {
  spec: listWorkersSpec,
  impl: async () => {
    if (isProductionServer()) {
      return { workers: [] };
    }
    const manager = await workerManager();
    return { workers: (await manager.list()).map(summarize) };
  }
};

const getWorkerStatus: CapabilityExport = {
  spec: getWorkerStatusSpec,
  impl: async (_run, params) => {
    const manager = await workerManager();
    const worker = resolveWorker(await manager.list(), params["worker_id"]);
    return { id: worker.id, status: await manager.status(worker.id) };
  }
};

const stopWorker: CapabilityExport = {
  spec: stopWorkerSpec,
  impl: async (_run, params) => {
    const manager = await workerManager();
    const worker = resolveWorker(await manager.list(), params["worker_id"]);
    if (worker.status === "stopped" || worker.status === "terminated") {
      return summarize(worker);
    }
    return summarize(await manager.stop(worker.id));
  }
};

export const WORKER_CAPABILITIES: readonly CapabilityExport[] = [
  listWorkers,
  getWorkerStatus,
  stopWorker
];

export const module: CapabilityModule = {
  module: "workers",
  exports: WORKER_CAPABILITIES
};
