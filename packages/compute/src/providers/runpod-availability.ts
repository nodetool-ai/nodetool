/**
 * RunPod GPU stock levels. The REST API v2 has no availability endpoint, so
 * this reads `gpuTypes.lowestPrice.stockStatus` from the GraphQL API.
 *
 * `stockStatus` is a rough level, not a reservation: a pod request can still
 * fail on a GPU reported as available. `minCudaVersion` filters hosts, so the
 * level matches what `createPod` with the same minimum can rent.
 */

import { WORKER_MIN_CUDA_VERSION } from "./runpod-rest.js";

export const DEFAULT_RUNPOD_GRAPHQL_URL = "https://api.runpod.io/graphql";

export type RunpodStockStatus = "High" | "Medium" | "Low";

export interface RunpodGpuAvailability {
  /** RunPod GPU type id, such as `NVIDIA L40S`. */
  id: string;
  displayName: string;
  /** Secure Cloud stock, or null when no host is free. */
  secure: RunpodStockStatus | null;
  /** Community Cloud stock, or null when no host is free. */
  community: RunpodStockStatus | null;
}

export interface FetchRunpodGpuAvailabilityOptions {
  gpuCount?: number;
  minCudaVersion?: string;
  signal?: AbortSignal;
}

const STOCK_RANK: Record<RunpodStockStatus, number> = {
  High: 3,
  Medium: 2,
  Low: 1
};

function toStock(value: unknown): RunpodStockStatus | null {
  return value === "High" || value === "Medium" || value === "Low"
    ? value
    : null;
}

/** The better of the two cloud tiers, as a sortable rank (0 = none). */
export function availabilityRank(
  entry: Pick<RunpodGpuAvailability, "secure" | "community"> | undefined
): number {
  if (!entry) return 0;
  return Math.max(
    entry.secure ? STOCK_RANK[entry.secure] : 0,
    entry.community ? STOCK_RANK[entry.community] : 0
  );
}

interface GraphqlGpuType {
  id?: unknown;
  displayName?: unknown;
  secure?: { stockStatus?: unknown } | null;
  community?: { stockStatus?: unknown } | null;
}

export async function fetchRunpodGpuAvailability(
  apiKey: string,
  options: FetchRunpodGpuAvailabilityOptions = {}
): Promise<RunpodGpuAvailability[]> {
  const gpuCount = Math.max(1, Math.floor(options.gpuCount ?? 1));
  const cuda = options.minCudaVersion ?? WORKER_MIN_CUDA_VERSION;
  if (!/^\d+(?:\.\d+)?$/.test(cuda)) {
    throw new Error(`Invalid minCudaVersion: ${cuda}`);
  }
  const input = (secure: boolean): string =>
    `{gpuCount:${gpuCount}, secureCloud:${secure}, minCudaVersion:"${cuda}"}`;
  const query =
    `{ gpuTypes { id displayName ` +
    `secure: lowestPrice(input:${input(true)}) { stockStatus } ` +
    `community: lowestPrice(input:${input(false)}) { stockStatus } } }`;

  const url =
    process.env.RUNPOD_GRAPHQL_URL?.trim() || DEFAULT_RUNPOD_GRAPHQL_URL;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query }),
    signal: options.signal
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `RunPod GraphQL availability query failed (${response.status}): ${text.slice(0, 300)}`
    );
  }
  const body = JSON.parse(text) as {
    data?: { gpuTypes?: GraphqlGpuType[] };
    errors?: Array<{ message?: string }>;
  };
  if (body.errors?.length) {
    throw new Error(
      `RunPod GraphQL availability query failed: ${body.errors
        .map((error) => error.message ?? "unknown error")
        .join("; ")}`
    );
  }
  return (body.data?.gpuTypes ?? []).flatMap((gpu) =>
    typeof gpu.id === "string"
      ? [
          {
            id: gpu.id,
            displayName:
              typeof gpu.displayName === "string" ? gpu.displayName : gpu.id,
            secure: toStock(gpu.secure?.stockStatus),
            community: toStock(gpu.community?.stockStatus)
          }
        ]
      : []
  );
}
