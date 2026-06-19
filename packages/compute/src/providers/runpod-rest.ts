/**
 * RunPod Pod management over the REST API (https://rest.runpod.io/v1).
 *
 * The serverless helpers in `runpod-api.ts` create templates/endpoints (the
 * job/queue model) and read the API key from `process.env`. This module manages
 * **persistent Pods** — the right shape for a long-lived NodeTool WebSocket
 * worker the server/CLI attaches to — and takes the API key **explicitly** so it
 * can be sourced from the per-user secret store (`getSecret`), never the
 * environment.
 *
 * REST surface used: POST /v1/pods, GET /v1/pods/{id}, POST /v1/pods/{id}/stop,
 * DELETE /v1/pods/{id}, GET /v1/pods.
 */

const RUNPOD_REST_BASE_URL = "https://rest.runpod.io/v1";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Request body for POST /v1/pods (subset we use; see the REST reference). */
export interface RunpodPodSpec {
  name: string;
  imageName: string;
  computeType?: "CPU" | "GPU";
  // CPU pods
  vcpuCount?: number;
  cpuFlavorIds?: string[];
  cpuFlavorPriority?: "availability" | "custom";
  // GPU pods
  gpuTypeIds?: string[];
  gpuCount?: number;
  // Common
  ports?: string[]; // e.g. ["7777/http"] or ["7777/tcp"]
  env?: Record<string, string>;
  containerDiskInGb?: number;
  volumeInGb?: number;
  volumeMountPath?: string;
  networkVolumeId?: string;
  dockerEntrypoint?: string[];
  dockerStartCmd?: string[];
  supportPublicIp?: boolean;
  globalNetworking?: boolean;
  dataCenterIds?: string[];
}

/** Pod as returned by GET /v1/pods/{id} (fields we read). */
export interface RunpodPod {
  id: string;
  name?: string;
  desiredStatus?: "RUNNING" | "READYT" | "EXITED" | "TERMINATED" | string;
  image?: string;
  /** Public IPv4; empty/null while the Pod is initializing. */
  publicIp?: string | null;
  /** Internal→external port map, e.g. {"7777": 41021}. */
  portMappings?: Record<string, number> | null;
  ports?: string[];
  /** Hourly cost (USD) RunPod bills for this pod's compute. */
  costPerHr?: number;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// REST transport (explicit key — no process.env)
// ---------------------------------------------------------------------------

type HttpMethod = "GET" | "POST" | "DELETE";

/**
 * Call the RunPod REST API with an explicitly-supplied key.
 *
 * @param apiKey   RunPod API key (from the per-user secret store).
 * @param endpoint Path under /v1, e.g. "pods" or "pods/<id>".
 */
async function runpodRest(
  apiKey: string,
  endpoint: string,
  method: HttpMethod = "GET",
  data?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("RunPod API key is required");
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json"
    },
    signal: AbortSignal.timeout(60_000)
  };
  if (data && method === "POST") init.body = JSON.stringify(data);

  const response = await fetch(`${RUNPOD_REST_BASE_URL}/${endpoint}`, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `RunPod REST ${method} /${endpoint} failed (${response.status}): ${body}`
    );
  }
  if (method === "DELETE" && response.status === 204) return {};
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

// ---------------------------------------------------------------------------
// Pod operations
// ---------------------------------------------------------------------------

/** Create (and deploy) a Pod. POST /v1/pods. */
export async function createPod(
  apiKey: string,
  spec: RunpodPodSpec
): Promise<RunpodPod> {
  const pod = (await runpodRest(
    apiKey,
    "pods",
    "POST",
    spec as unknown as Record<string, unknown>
  )) as RunpodPod;
  if (!pod?.id) throw new Error("RunPod createPod returned no pod id");
  return pod;
}

/** Get a Pod by id. GET /v1/pods/{id}. */
export async function getPod(apiKey: string, id: string): Promise<RunpodPod> {
  return (await runpodRest(apiKey, `pods/${id}`)) as RunpodPod;
}

/** List Pods. GET /v1/pods. */
export async function listPods(apiKey: string): Promise<RunpodPod[]> {
  const res = await runpodRest(apiKey, "pods");
  if (Array.isArray(res)) return res as RunpodPod[];
  const arr = (res as { pods?: unknown }).pods;
  return Array.isArray(arr) ? (arr as RunpodPod[]) : [];
}

/** Stop a Pod (releases compute, keeps the volume). POST /v1/pods/{id}/stop. */
export async function stopPod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}/stop`, "POST");
}

/**
 * Resume a stopped Pod (re-allocates compute, keeps the volume).
 * POST /v1/pods/{id}/start. May fail or return zero GPUs if RunPod capacity has
 * changed since the Pod was stopped.
 */
export async function startPod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}/start`, "POST");
}

/** Terminate a Pod (deletes it). DELETE /v1/pods/{id}. */
export async function deletePod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}`, "DELETE");
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

/**
 * Direct TCP WebSocket URL for an exposed `/tcp` port, or null while the Pod
 * lacks a public IP / port mapping. Preferred for large frames (no HTTP proxy).
 */
export function podDirectWsUrl(
  pod: RunpodPod,
  internalPort: number
): string | null {
  const ext = pod.portMappings?.[String(internalPort)];
  if (!pod.publicIp || !ext) return null;
  return `ws://${pod.publicIp}:${ext}`;
}

/**
 * RunPod HTTP-proxy WebSocket URL for an exposed `/http` port. TLS-terminated
 * by RunPod; subject to the proxy's size/timeout limits (fine for small frames).
 */
export function podProxyWsUrl(podId: string, internalPort: number): string {
  return `wss://${podId}-${internalPort}.proxy.runpod.net`;
}

// ---------------------------------------------------------------------------
// High-level worker deploy
// ---------------------------------------------------------------------------

/**
 * Default GPUs requested for a GPU pod. RunPod's REST API does not document a
 * default for `gpuCount`, so we set it explicitly to avoid a "running" pod that
 * was allocated zero GPUs. One GPU is the right default for a single worker.
 */
export const DEFAULT_GPU_COUNT = 1;

/**
 * Default vCPUs for a GPU pod. RunPod pairs vCPUs with the GPU on GPU pods, but
 * leaving `vcpuCount` undefined relies on undocumented defaults; pin a sane
 * value so the worker has CPU headroom for I/O and the bridge process.
 */
export const DEFAULT_GPU_VCPU_COUNT = 8;

/** Default vCPUs for a CPU pod. */
export const DEFAULT_CPU_VCPU_COUNT = 4;

export interface DeployWorkerPodOptions {
  /** Pod name. */
  name: string;
  /** Registry image RunPod pulls (must be reachable by RunPod). */
  image: string;
  /** Shared-secret passed as NODETOOL_WORKER_TOKEN (gates the ws handshake). */
  workerToken?: string;
  /** Internal port the worker serves on. Default 7777. */
  internalPort?: number;
  /** Expose via RunPod HTTP proxy ("http" → wss proxy) or direct TCP. */
  exposure?: "http" | "tcp";
  computeType?: "CPU" | "GPU";
  vcpuCount?: number;
  gpuTypeIds?: string[];
  /** GPUs per pod (GPU pods only). Defaults to {@link DEFAULT_GPU_COUNT}. */
  gpuCount?: number;
  containerDiskInGb?: number;
  /** Persistent volume size in GB (mounted at `volumeMountPath`). */
  volumeInGb?: number;
  /** Mount path for the persistent volume. Defaults to "/workspace". */
  volumeMountPath?: string;
  /** Extra env merged into the container. */
  env?: Record<string, string>;
  /** Poll budget for the Pod to reach RUNNING + expose its endpoint. */
  timeoutMs?: number;
}

export interface DeployedWorkerPod {
  podId: string;
  /** ws/wss URL to set as NODETOOL_WORKER_URL. */
  wsUrl: string;
  pod: RunpodPod;
}

/**
 * Deploy a NodeTool worker image as a persistent RunPod Pod and wait until it is
 * RUNNING with a resolvable WebSocket endpoint. Does NOT read process.env — pass
 * `apiKey` (from the secret store) and `workerToken` explicitly.
 *
 * Reaching RUNNING + having an endpoint does not guarantee the worker process
 * has finished loading nodes; the caller should connect with retry.
 */
export async function deployWorkerPod(
  apiKey: string,
  opts: DeployWorkerPodOptions
): Promise<DeployedWorkerPod> {
  const internalPort = opts.internalPort ?? 7777;
  const exposure = opts.exposure ?? "http";
  const env: Record<string, string> = { ...(opts.env ?? {}) };
  if (opts.workerToken) env.NODETOOL_WORKER_TOKEN = opts.workerToken;

  const isGpu = opts.computeType === "GPU";
  const spec: RunpodPodSpec = {
    name: opts.name,
    imageName: opts.image,
    computeType: opts.computeType ?? "CPU",
    // Always pin vcpuCount explicitly rather than relying on RunPod defaults.
    vcpuCount:
      opts.vcpuCount ??
      (isGpu ? DEFAULT_GPU_VCPU_COUNT : DEFAULT_CPU_VCPU_COUNT),
    gpuTypeIds: opts.gpuTypeIds,
    // GPU pods must request an explicit gpuCount; without it RunPod may allocate
    // zero GPUs while still reporting the pod as running.
    ...(isGpu ? { gpuCount: opts.gpuCount ?? DEFAULT_GPU_COUNT } : {}),
    ports: [`${internalPort}/${exposure}`],
    env,
    containerDiskInGb: opts.containerDiskInGb ?? 20,
    // Persistent volume — survives stop/resume, holds the HF model cache.
    ...(opts.volumeInGb
      ? {
          volumeInGb: opts.volumeInGb,
          volumeMountPath: opts.volumeMountPath ?? "/workspace"
        }
      : {})
  };

  const created = await createPod(apiKey, spec);
  try {
    const { pod, wsUrl } = await waitForPodEndpoint(apiKey, created.id, {
      internalPort,
      exposure,
      timeoutMs: opts.timeoutMs ?? 240_000
    });
    return { podId: created.id, wsUrl, pod };
  } catch (err) {
    // The pod exists and is billing, but polling never reached a usable
    // endpoint. Tear it down so we don't leak a billing orphan, then surface
    // the original failure. Cleanup errors must not mask the root cause.
    await deletePod(apiKey, created.id).catch(() => {});
    throw err;
  }
}

/** Poll GET /v1/pods/{id} until RUNNING with a resolvable endpoint. */
export async function waitForPodEndpoint(
  apiKey: string,
  id: string,
  opts: {
    internalPort: number;
    exposure: "http" | "tcp";
    timeoutMs?: number;
    intervalMs?: number;
  }
): Promise<{ pod: RunpodPod; wsUrl: string }> {
  const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
  const intervalMs = opts.intervalMs ?? 5_000;
  let last: RunpodPod | undefined;
  while (Date.now() < deadline) {
    const pod = await getPod(apiKey, id);
    last = pod;
    if (pod.desiredStatus === "TERMINATED" || pod.desiredStatus === "EXITED") {
      throw new Error(`Pod ${id} reached terminal status ${pod.desiredStatus}`);
    }
    if (pod.desiredStatus === "RUNNING" || pod.desiredStatus === "READYT") {
      if (opts.exposure === "http") {
        return { pod, wsUrl: podProxyWsUrl(id, opts.internalPort) };
      }
      const direct = podDirectWsUrl(pod, opts.internalPort);
      if (direct) return { pod, wsUrl: direct };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Pod ${id} did not become reachable within the timeout (last status: ${last?.desiredStatus ?? "unknown"})`
  );
}
