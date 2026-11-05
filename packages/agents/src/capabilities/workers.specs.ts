/**
 * The `workers` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `workers.ts`.
 */

import type { CapabilitySpec } from "./types.js";

const WORKER_ID_PROPERTY = {
  type: "string",
  description: "Worker id from list_workers: the full id or its first 12 characters."
};

export const listWorkersSpec: CapabilitySpec = {
  name: "list_workers",
  description:
    "List the rented GPU workers this install tracks: id, profile, provider, " +
    "status, hourly cost and last activity. Use it to find a worker that is " +
    "still billing. A stopped worker still bills for its volume. The result " +
    "omits connection URLs and tokens. On a production server the list is empty.",
  inputSchema: { type: "object", properties: {}, required: [] },
  category: "read",
  userMessage: () => "Listing GPU workers"
};

export const getWorkerStatusSpec: CapabilitySpec = {
  name: "get_worker_status",
  description:
    "Ask the provider for the current status of one rented GPU worker. Use it " +
    "when list_workers may be out of date.",
  inputSchema: {
    type: "object",
    properties: { worker_id: WORKER_ID_PROPERTY },
    required: ["worker_id"]
  },
  category: "read",
  userMessage: (params) => `Checking GPU worker ${String(params["worker_id"])}`
};

export const stopWorkerSpec: CapabilitySpec = {
  name: "stop_worker",
  description:
    "Pause one rented GPU worker. This releases the GPU and keeps the volume, " +
    "which still bills. Any run on the worker fails. The worker can be " +
    "resumed from the desktop app, if the provider has a free GPU.",
  inputSchema: {
    type: "object",
    properties: { worker_id: WORKER_ID_PROPERTY },
    required: ["worker_id"]
  },
  category: "external",
  userMessage: (params) => `Stopping GPU worker ${String(params["worker_id"])}`
};

/** Every spec this module declares, in declaration order. */
export const workersSpecs: readonly CapabilitySpec[] = [
  listWorkersSpec,
  getWorkerStatusSpec,
  stopWorkerSpec
];
