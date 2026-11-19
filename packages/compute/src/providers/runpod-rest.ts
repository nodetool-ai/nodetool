/**
 * RunPod Pod management over the REST API v2 (https://api.runpod.io/v2).
 *
 * This module manages **persistent Pods** — the right shape for a long-lived
 * NodeTool WebSocket worker the server/CLI attaches to — and takes the API key
 * **explicitly** so it can be sourced from the per-user secret store
 * (`getSecret`), never the environment.
 *
 * REST surface used: POST /v2/pods, GET /v2/pods/{id}, GET /v2/pods,
 * POST /v2/pods/{id}/action (start / stop), DELETE /v2/pods/{id}.
 */

export const DEFAULT_RUNPOD_REST_BASE_URL = "https://api.runpod.io/v2";

/**
 * Resolve the RunPod REST API base URL. Honors `RUNPOD_REST_BASE_URL` when set
 * so future API base changes can be overridden without a release.
 */
export function getRunpodRestBaseUrl(): string {
  const configured = process.env.RUNPOD_REST_BASE_URL?.trim();
  return (configured || DEFAULT_RUNPOD_REST_BASE_URL).replace(/\/+$/, "");
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** GPU configuration for POST /v2/pods (`CreateGpuConfig`). */
export interface RunpodCreateGpuConfig {
  id: string;
  count?: number;
  /** CUDA versions the host driver must support, as `major.minor`. */
  allowedCudaVersions?: string[];
  minCudaVersion?: string;
  minRamPerGpu?: number;
  minVcpuCountPerGpu?: number;
}

/** CPU configuration for POST /v2/pods (`CreateCpuConfig`). */
export interface RunpodCreateCpuConfig {
  /** CPU flavor identifier, e.g. `"cpu5c"`. */
  id: string;
  /** Number of vCPUs (minimum 2, power of two). */
  vcpuCount: number;
}

/** Host-local persistent volume mount (GPU pods only). */
export interface RunpodPersistentMount {
  /** Storage size in GB (minimum 10). */
  size: number;
  /** Mount path inside the container, e.g. `"/workspace"`. */
  path: string;
}

/** Network volume mount attached to a pod. */
export interface RunpodNetworkMount {
  volumeId: string;
  path: string;
}

/** Storage mounts for POST /v2/pods (`Mounts`). */
export interface RunpodPodMounts {
  persistent?: RunpodPersistentMount;
  network?: RunpodNetworkMount[];
  global?: { volumeId: string; path?: string }[];
}

/** Request body for POST /v2/pods (subset we use; see the v2 OpenAPI spec). */
export interface RunpodPodSpec {
  name: string;
  image?: string;
  templateId?: string;
  cloud?: "SECURE" | "COMMUNITY";
  // Exactly one of `gpu` or `cpu` must be set.
  gpu?: RunpodCreateGpuConfig;
  cpu?: RunpodCreateCpuConfig;
  // Common container / placement fields
  ports?: string[]; // e.g. ["7777/http"] or ["7777/tcp"]
  env?: Record<string, string>;
  /** Ephemeral container disk in GB (minimum 1). */
  disk?: number;
  mounts?: RunpodPodMounts;
  entrypoint?: string[];
  cmd?: string[];
  args?: string;
  globalNetworking?: boolean;
  dataCenterIds?: string[];
  startSsh?: boolean;
  startJupyter?: boolean;
}

/** Lifecycle status of a pod in RunPod REST API v2. */
export type RunpodPodStatus =
  | "PROVISIONING"
  | "STARTING"
  | "RUNNING"
  | "EXITED"
  | "ERROR"
  | "TERMINATED";

/** Live port mapping entry in `pod.runtime.ports`. */
export interface RunpodRuntimePort {
  private: number;
  public?: number | null;
  type: string;
  ip?: string | null;
}

/** Live runtime block returned by GET /v2/pods/{id} while RUNNING. */
export interface RunpodPodRuntime {
  uptime?: number;
  ports?: RunpodRuntimePort[];
  [k: string]: unknown;
}

/** Pod as returned by GET /v2/pods/{id} (fields we read). */
export interface RunpodPod {
  id: string;
  name?: string;
  status?: RunpodPodStatus | string;
  image?: string;
  /** Live metrics and port mappings; null when not RUNNING or in list responses. */
  runtime?: RunpodPodRuntime | null;
  ports?: string[];
  /** Hourly compute rate (USD) RunPod bills for this pod. */
  cost?: number;
  [k: string]: unknown;
}

// ---------------------------------------------------------------------------
// REST transport (explicit key — no process.env for credentials)
// ---------------------------------------------------------------------------

type HttpMethod = "GET" | "POST" | "DELETE";

/**
 * Call the RunPod REST API v2 with an explicitly-supplied key.
 *
 * @param apiKey   RunPod API key (from the per-user secret store).
 * @param endpoint Path under /v2, e.g. "pods" or "pods/<id>".
 */
async function runpodRest(
  apiKey: string,
  endpoint: string,
  method: HttpMethod = "GET",
  data?: unknown
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
  if (data !== undefined && method === "POST") init.body = JSON.stringify(data);

  const response = await fetch(`${getRunpodRestBaseUrl()}/${endpoint}`, init);
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

/** Create (and deploy) a Pod. POST /v2/pods. */
export async function createPod(
  apiKey: string,
  spec: RunpodPodSpec
): Promise<RunpodPod> {
  const pod = (await runpodRest(
    apiKey,
    "pods",
    "POST",
    spec
  )) as RunpodPod;
  if (!pod?.id) throw new Error("RunPod createPod returned no pod id");
  return pod;
}

/** Get a Pod by id. GET /v2/pods/{id}. */
export async function getPod(apiKey: string, id: string): Promise<RunpodPod> {
  return (await runpodRest(apiKey, `pods/${id}`)) as RunpodPod;
}

/** List Pods. GET /v2/pods (follows cursor pagination when present). */
export async function listPods(apiKey: string): Promise<RunpodPod[]> {
  const pods: RunpodPod[] = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();

  for (let page = 0; page < 100; page++) {
    const endpoint = cursor
      ? `pods?cursor=${encodeURIComponent(cursor)}`
      : "pods";
    const res = await runpodRest(apiKey, endpoint);
    if (Array.isArray(res)) {
      pods.push(...(res as RunpodPod[]));
      break;
    }
    if (Array.isArray(res.pods)) {
      pods.push(...(res.pods as RunpodPod[]));
    }
    const pagination = res.pagination as
      | { hasNextPage?: boolean; nextCursor?: string | null }
      | undefined;
    if (
      !pagination?.hasNextPage ||
      typeof pagination.nextCursor !== "string" ||
      !pagination.nextCursor ||
      seenCursors.has(pagination.nextCursor)
    ) {
      break;
    }
    seenCursors.add(pagination.nextCursor);
    cursor = pagination.nextCursor;
  }

  return pods;
}

/** Stop a Pod (releases compute, keeps the volume). POST /v2/pods/{id}/action. */
export async function stopPod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}/action`, "POST", { action: "stop" });
}

/**
 * Resume a stopped Pod (re-allocates compute, keeps the volume).
 * POST /v2/pods/{id}/action. May fail if RunPod capacity has changed since the
 * Pod was stopped.
 */
export async function startPod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}/action`, "POST", { action: "start" });
}

/** Terminate a Pod (deletes it). DELETE /v2/pods/{id}. */
export async function deletePod(apiKey: string, id: string): Promise<void> {
  await runpodRest(apiKey, `pods/${id}`, "DELETE");
}

// ---------------------------------------------------------------------------
// Endpoint helpers
// ---------------------------------------------------------------------------

/**
 * Direct TCP WebSocket URL for an exposed `/tcp` port, or null while the Pod
 * lacks a public IP / port mapping in `pod.runtime.ports`. Preferred for large
 * frames (no HTTP proxy).
 */
export function podDirectWsUrl(
  pod: RunpodPod,
  internalPort: number
): string | null {
  const port = pod.runtime?.ports?.find((p) => p.private === internalPort);
  if (!port?.ip || !port.public) return null;
  return `ws://${port.ip}:${port.public}`;
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

/** Default GPUs requested for a GPU pod. */
export const DEFAULT_GPU_COUNT = 1;

/** Default CPU flavor identifier for a CPU pod (`GET /v2/catalog/cpus`). */
export const DEFAULT_CPU_FLAVOR_ID = "cpu5c";

/** Default vCPUs for a CPU pod (power of two, minimum 2). */
export const DEFAULT_CPU_VCPU_COUNT = 4;

/**
 * Minimum CUDA version a GPU worker host must support. The worker image
 * installs PyPI's Linux torch, which is a CUDA 13.0 build and needs an NVIDIA
 * driver of 580 or newer. Using `minCudaVersion` (rather than exact-match
 * `allowedCudaVersions`) accepts 13.0 and any newer host CUDA version.
 */
export const WORKER_MIN_CUDA_VERSION = "13.0";

/** @deprecated Use {@link WORKER_MIN_CUDA_VERSION} with `minCudaVersion`. */
export const WORKER_CUDA_VERSIONS: readonly string[] = [WORKER_MIN_CUDA_VERSION];

/** Matches RunPod's capacity-exhausted error responses across API versions. */
export function isRunpodCapacityError(err: unknown): boolean {
  return err instanceof Error && /no (?:longer any )?instances/i.test(err.message);
}

export interface DeployWorkerPodOptions {
  /** Pod name. */
  name: string;
  /** Registry image RunPod pulls (must be reachable by RunPod). */
  image: string;
  /** RunPod template. Replaces the image, ports and default disks. */
  templateId?: string;
  /** Shared-secret passed as NODETOOL_WORKER_TOKEN (gates the ws handshake). */
  workerToken?: string;
  /** Internal port the worker serves on. Default 7777. */
  internalPort?: number;
  /** Expose via RunPod HTTP proxy ("http" → wss proxy) or direct TCP. */
  exposure?: "http" | "tcp";
  /**
   * RunPod cloud tier. When omitted, tries `"SECURE"` first and falls back to
   * `"COMMUNITY"` if Secure Cloud reports no available capacity.
   */
  cloud?: "SECURE" | "COMMUNITY";
  computeType?: "CPU" | "GPU";
  /** CPU flavor identifier (CPU pods only). Defaults to {@link DEFAULT_CPU_FLAVOR_ID}. */
  cpuFlavorId?: string;
  /** vCPU count (exact on CPU pods; converted to minVcpuCountPerGpu on GPU pods). */
  vcpuCount?: number;
  /** Single GPU type identifier (GPU pods only). */
  gpuTypeId?: string;
  /** @deprecated Prefer `gpuTypeId`; the first entry is used in API v2. */
  gpuTypeIds?: string[];
  /** GPUs per pod (GPU pods only). Defaults to {@link DEFAULT_GPU_COUNT}. */
  gpuCount?: number;
  /**
   * Minimum CUDA version the host must support (GPU pods only). Defaults to
   * {@link WORKER_MIN_CUDA_VERSION} unless `allowedCudaVersions` is supplied.
   */
  minCudaVersion?: string;
  /**
   * Exact CUDA versions the host must support (GPU pods only). Pass `[]` to
   * disable the default {@link WORKER_MIN_CUDA_VERSION} floor.
   */
  allowedCudaVersions?: readonly string[];
  containerDiskInGb?: number;
  /** Persistent volume size in GB (GPU pods only; mounted at `volumeMountPath`). */
  volumeInGb?: number;
  /** Mount path for the persistent volume. Defaults to "/workspace". */
  volumeMountPath?: string;
  /** Extra env merged into the container. */
  env?: Record<string, string>;
  /**
   * OpenSSH public key. When set, 22/tcp is exposed and the key is passed as
   * PUBLIC_KEY, which the worker entrypoint installs before starting sshd.
   *
   * A rented worker is otherwise reachable only through the node-execution
   * bridge, so diagnosing one means inferring its state from pass/fail of whole
   * model loads. A shell turns that into reading the state directly.
   */
  sshPublicKey?: string;
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
 * RUNNING with a resolvable WebSocket endpoint. Does NOT read process.env for
 * credentials — pass `apiKey` (from the secret store) and `workerToken`
 * explicitly.
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
  const sshKey = opts.sshPublicKey?.trim();
  if (sshKey) env.PUBLIC_KEY = sshKey;

  const isGpu = opts.computeType === "GPU";
  const spec: RunpodPodSpec = {
    name: opts.name,
    ...(opts.templateId ? { templateId: opts.templateId } : { image: opts.image }),
    env
  };
  if (opts.cloud) {
    spec.cloud = opts.cloud;
  }

  if (isGpu) {
    const gpuId = opts.gpuTypeId ?? opts.gpuTypeIds?.[0];
    if (!gpuId) {
      throw new Error("RunPod GPU pod requires a GPU type id");
    }
    const gpuCount = opts.gpuCount ?? DEFAULT_GPU_COUNT;
    const gpu: RunpodCreateGpuConfig = {
      id: gpuId,
      count: gpuCount
    };
    if (opts.vcpuCount !== undefined) {
      gpu.minVcpuCountPerGpu = Math.max(1, Math.floor(opts.vcpuCount / gpuCount));
    }
    if (opts.minCudaVersion) {
      gpu.minCudaVersion = opts.minCudaVersion;
    } else if (opts.allowedCudaVersions !== undefined) {
      if (opts.allowedCudaVersions.length > 0) {
        gpu.allowedCudaVersions = [...opts.allowedCudaVersions];
      }
    } else {
      gpu.minCudaVersion = WORKER_MIN_CUDA_VERSION;
    }
    spec.gpu = gpu;
  } else {
    spec.cpu = {
      id: opts.cpuFlavorId ?? DEFAULT_CPU_FLAVOR_ID,
      vcpuCount: opts.vcpuCount ?? DEFAULT_CPU_VCPU_COUNT
    };
  }

  // A template owns its ports and container disk, unless the caller overrides.
  if (!opts.templateId) {
    spec.ports = sshKey
      ? [`${internalPort}/${exposure}`, "22/tcp"]
      : [`${internalPort}/${exposure}`];
  }
  if (!opts.templateId || opts.containerDiskInGb) {
    spec.disk = opts.containerDiskInGb ?? 20;
  }

  // Persistent volume — survives stop/resume, holds the HF model cache.
  // RunPod API v2 disallows `mounts.persistent` on CPU pods and requires both
  // `size` and `path` whenever `persistent` is set.
  if (isGpu && opts.volumeInGb) {
    spec.mounts = {
      persistent: {
        size: opts.volumeInGb,
        path: opts.volumeMountPath ?? "/workspace"
      }
    };
  }

  let created: RunpodPod;
  try {
    created = await createPod(apiKey, spec);
  } catch (err) {
    // API v2 removed `cloudType: "ALL"` and defaults to `"SECURE"` only.
    // When the caller did not pin a cloud tier and Secure Cloud has no
    // capacity, retry once on Community Cloud.
    if (!opts.cloud && isRunpodCapacityError(err)) {
      created = await createPod(apiKey, { ...spec, cloud: "COMMUNITY" });
    } else {
      throw err;
    }
  }
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

/** Poll GET /v2/pods/{id} until RUNNING with a resolvable endpoint. */
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
    if (
      pod.status === "TERMINATED" ||
      pod.status === "EXITED" ||
      pod.status === "ERROR"
    ) {
      throw new Error(`Pod ${id} reached terminal status ${pod.status}`);
    }
    if (pod.status === "RUNNING") {
      if (opts.exposure === "http") {
        return { pod, wsUrl: podProxyWsUrl(id, opts.internalPort) };
      }
      const direct = podDirectWsUrl(pod, opts.internalPort);
      if (direct) return { pod, wsUrl: direct };
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(
    `Pod ${id} did not become reachable within the timeout (last status: ${last?.status ?? "unknown"})`
  );
}
