// Verda-backed `WorkerProvider` (https://api.verda.com/v1).
//
// Verda rents VIRTUAL MACHINES, not containers. The NodeTool worker image is
// something the guest RUNS, so provisioning is two-layered: pick a CUDA+Docker
// OS image for the machine, then hand Verda a startup script that runs the
// worker image on it. `WorkerSpec.osImage` names the former, `WorkerSpec.image`
// the latter.
//
// Lifecycle deliberately does NOT mirror RunPod/Vast, because Verda's does not:
//
//   * Verda bills a SHUT-DOWN instance at the full rate, and removed its
//     hibernate action for exactly that reason. Mapping `stop` to `shutdown`
//     would make the idle reaper stop workers while saving nothing, so `stop`
//     instead DELETES the instance while retaining its OS volume — the
//     "release compute, keep disks" operation. The model cache survives; the
//     GPU bill ends.
//   * `resume` therefore CREATES A NEW MACHINE from the retained OS volume. It
//     returns a new `providerRef`, which the manager persists.
//   * `terminate` deletes compute AND permanently deletes the OS volume, so no
//     billable storage is left behind in the 96-hour trash window.
//
// Because `stop` destroys the instance record, everything `resume` needs to
// rebuild the machine is encoded in the provider ref (see `encodeRef`).
//
// Credentials are injected by the `WorkerManager`; this provider never reads
// `process.env`.

import {
  DEFAULT_VOLUME_GB,
  WORKER_HF_HOME,
  WORKER_VOLUME_MOUNT,
  type ProviderInstance,
  type ProvisionResult,
  type WorkerProvider,
  type WorkerSpec,
  type WorkerStatus,
} from "./types.js";
import {
  assertSafeId,
  VerdaApiClient,
  VerdaApiError,
  type VerdaCredentials,
} from "./verda-api.js";

/** Port the worker serves on, published from the container to the VM. */
const WORKER_PORT = 7777;

/** Pay-as-you-go only. Long-term contracts are prepaid and are never chosen
 * on the user's behalf; spot instances can be discontinued mid-workflow. */
const CONTRACT = "PAY_AS_YOU_GO";

/** Name of the container the startup script runs, used for idempotent reruns. */
const CONTAINER_NAME = "nodetool-worker";

/** A Verda instance as returned by `GET /v1/instances` (fields we read). */
interface VerdaInstance {
  id?: string;
  ip?: string;
  status?: string;
  hostname?: string;
  description?: string;
  instance_type?: string;
  location?: string;
  os_volume_id?: string;
  volume_ids?: string[];
  ssh_key_ids?: string[];
  startup_script_id?: string;
  price_per_hour?: number;
}

/** An OS image from `GET /v1/images`. */
interface VerdaOsImage {
  id?: string;
  image_type?: string;
  name?: string;
  details?: string[];
}

/**
 * The create plan carried inside a provider ref. `stop` destroys the instance,
 * so `resume` cannot read these back from the API — they travel with the handle.
 */
interface VerdaRef {
  /** Instance id. Empty once the instance has been released by `stop`. */
  i: string;
  /** Retained OS volume id — the model cache, and `resume`'s boot disk. */
  v: string;
  /** Instance type, re-requested on resume. */
  t: string;
  /** Location code, re-requested on resume. */
  l: string;
  /** Startup script id. */
  s?: string;
  /** SSH key ids. */
  k?: string[];
  /** Hostname. */
  h?: string;
}

/**
 * Encode a create plan as an opaque provider handle.
 *
 * `provision` and `list` both build this from the SAME `GET` representation, so
 * a live instance encodes to the identical string in both paths and the
 * manager's orphan reconcile matches it by equality.
 */
function encodeRef(ref: VerdaRef): string {
  const ordered: VerdaRef = {
    i: ref.i,
    v: ref.v,
    t: ref.t,
    l: ref.l,
    s: ref.s,
    k: ref.k,
    h: ref.h,
  };
  return `verda:${Buffer.from(JSON.stringify(ordered)).toString("base64url")}`;
}

/** Decode a provider handle produced by `encodeRef`. */
function decodeRef(ref: string): VerdaRef {
  if (!ref.startsWith("verda:")) {
    throw new Error(`Not a Verda worker handle: ${JSON.stringify(ref)}`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      Buffer.from(ref.slice("verda:".length), "base64url").toString("utf8")
    );
  } catch {
    throw new Error(`Corrupt Verda worker handle: ${JSON.stringify(ref)}`);
  }
  const plan = parsed as VerdaRef;
  if (typeof plan?.v !== "string" || typeof plan?.t !== "string") {
    throw new Error(`Incomplete Verda worker handle: ${JSON.stringify(ref)}`);
  }
  return plan;
}

/** Build the handle for an instance as the API currently reports it. */
function refFromInstance(instance: VerdaInstance): string {
  return encodeRef({
    i: instance.id ?? "",
    v: instance.os_volume_id ?? "",
    t: instance.instance_type ?? "",
    l: instance.location ?? "",
    s: instance.startup_script_id || undefined,
    k: instance.ssh_key_ids?.length ? instance.ssh_key_ids : undefined,
    h: instance.hostname || undefined,
  });
}

/**
 * Map Verda's instance status onto the shared `WorkerStatus`.
 *
 * Unknown states map to `error`, not to a hopeful `provisioning`: a state this
 * code does not recognise must not read as progress to the poll loop.
 */
function mapInstanceStatus(status: string | undefined): WorkerStatus {
  switch (status) {
    case "running":
      return "running";
    case "provisioning":
    case "ordered":
    case "new":
    case "validating":
    case "deploying":
      return "provisioning";
    case "offline":
      // Shut down but still allocated — and still billed. Not our paused state.
      return "stopped";
    case "deleting":
      return "stopping";
    case "discontinued":
    case "notfound":
      return "terminated";
    default:
      // error, no_capacity, installation_failed, unknown, and anything new.
      return "error";
  }
}

/** Single-quote a value for safe interpolation into the bootstrap script. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export class VerdaProvider implements WorkerProvider {
  private readonly api: VerdaApiClient;

  constructor(credentials: VerdaCredentials, api?: VerdaApiClient) {
    this.api = api ?? new VerdaApiClient(credentials);
  }

  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    // The startup script publishes 7777 with Docker, and Verda's own guide
    // warns that a UFW rule does NOT block a Docker-published port. The worker
    // is therefore reachable from the internet the moment it boots, so refuse
    // to launch one that accepts unauthenticated requests.
    if (!spec.token) {
      throw new Error(
        "Verda workers publish port 7777 on a public IP, so a bearer token is " +
          "required. Use a profile with token_policy 'generate' or 'fixed'."
      );
    }
    const instanceType = spec.gpu?.trim();
    if (!instanceType) {
      throw new Error(
        "Verda requires an instance type (e.g. \"1H100.80S.30V\"). Set the " +
          "profile's gpu field to a type from GET /v1/instance-types."
      );
    }

    const [osImage, locationCode] = await Promise.all([
      this.resolveOsImage(spec.osImage),
      this.resolveLocation(instanceType, spec.region),
    ]);

    const sshKeyIds = spec.sshPublicKey
      ? [await this.ensureSshKey(spec.name, spec.sshPublicKey)]
      : [];
    const scriptId = await this.createStartupScript(spec);

    const hostname = sanitizeHostname(spec.name);
    const create: Record<string, unknown> = {
      instance_type: instanceType,
      image: osImage,
      location_code: locationCode,
      hostname,
      description: `NodeTool worker (${spec.name})`,
      contract: CONTRACT,
      startup_script_id: scriptId,
      os_volume: {
        name: `${hostname}-os`,
        size: spec.disk ?? DEFAULT_VOLUME_GB,
      },
    };
    if (sshKeyIds.length > 0) {
      create.ssh_key_ids = sshKeyIds;
    }

    // `POST /v1/instances` answers 202 (accepted) — the machine does not exist
    // yet. Persist nothing until the id is known, then treat every later
    // failure as owning a billing resource that must be torn down.
    const instanceId = await this.createInstance(create);

    try {
      const instance = await this.waitForReady(instanceId);
      if (!instance.ip) {
        throw new Error(
          `Verda instance ${instanceId} became running without an IP address`
        );
      }
      return {
        providerRef: refFromInstance(instance),
        wsUrl: `ws://${instance.ip}:${WORKER_PORT}`,
        token: spec.token,
        status: "running",
        costUsd: instance.price_per_hour,
      };
    } catch (err) {
      // Destroy compute AND the just-created OS volume: nothing here is worth
      // retaining, and an orphan would bill until a reconcile scan found it.
      // The volumes must be NAMED — an empty list retains every one of them.
      await this.destroyWithVolumes(instanceId).catch(() => {
        // Best-effort teardown; the provision failure below is the real error.
      });
      throw err;
    }
  }

  async status(ref: string): Promise<WorkerStatus> {
    const plan = decodeRef(ref);
    if (!plan.i) {
      // Compute was released by `stop`; only the retained volume remains.
      return "stopped";
    }
    const instance = await this.getInstance(plan.i);
    if (!instance) {
      // The machine is gone but the OS volume was retained — this is the state
      // `stop` leaves behind, and it is resumable.
      return "stopped";
    }
    return mapInstanceStatus(instance.status);
  }

  /**
   * Pause: release the GPU compute, retain the OS volume and its model cache.
   *
   * This DELETES the Verda instance. A `shutdown` would keep billing the full
   * instance rate (Verda removed hibernate for the same reason), so it is not
   * the operation the cost guard needs.
   */
  async stop(ref: string): Promise<void> {
    const plan = decodeRef(ref);
    if (!plan.i) {
      return;
    }
    if (!plan.v) {
      throw new Error(
        "Refusing to pause a Verda worker with no recorded OS volume: " +
          "releasing its compute would destroy the machine with nothing to " +
          "resume from. Terminate it instead."
      );
    }
    // `volume_ids: []` is the documented "retain ALL attached volumes" form.
    // Omitting the field deletes the OS volume instead, so it is always sent.
    await this.deleteInstance(plan.i, { volumeIds: [], permanent: false });
  }

  /**
   * Resume: create a NEW machine that boots from the retained OS volume.
   *
   * Returns a new provider ref (the instance id changed). Verda can refuse for
   * lack of capacity, which surfaces as a distinct error rather than a retry.
   */
  async resume(ref: string): Promise<ProvisionResult> {
    const plan = decodeRef(ref);
    if (plan.i) {
      const existing = await this.getInstance(plan.i);
      if (existing && mapInstanceStatus(existing.status) === "running") {
        // Already live (a stop that failed after the caller gave up, say).
        return this.resultFor(existing);
      }
    }
    if (!plan.v) {
      throw new Error(
        "This Verda worker has no retained OS volume to resume from."
      );
    }

    const create: Record<string, unknown> = {
      instance_type: plan.t,
      // A customized OS volume id stands in for an image type: the machine
      // boots the retained disk, model cache and all.
      image: assertSafeId(plan.v, "volume id"),
      location_code: plan.l,
      hostname: plan.h ?? CONTAINER_NAME,
      description: "NodeTool worker (resumed)",
      contract: CONTRACT,
    };
    if (plan.s) create.startup_script_id = plan.s;
    if (plan.k?.length) create.ssh_key_ids = plan.k;

    const instanceId = await this.createInstance(create);
    try {
      const instance = await this.waitForReady(instanceId);
      if (!instance.ip) {
        throw new Error(
          `Verda instance ${instanceId} resumed without an IP address`
        );
      }
      return this.resultFor(instance);
    } catch (err) {
      // Release the failed machine but KEEP the volume: it is the user's model
      // cache and predates this resume attempt.
      await this.deleteInstance(instanceId, {
        volumeIds: [],
        permanent: false,
      }).catch(() => {
        // Best-effort; surface the resume failure below.
      });
      throw err;
    }
  }

  /**
   * Destroy the worker AND its OS volume — the real teardown that ends every
   * charge. The volume is deleted PERMANENTLY: a trashed volume still occupies
   * the storage quota and can be restored (at a charge for the deleted
   * interval), which is not what "terminate" promises. The model cache is gone.
   */
  async terminate(ref: string): Promise<void> {
    const plan = decodeRef(ref);
    if (plan.i) {
      const destroyed = await this.destroyWithVolumes(plan.i, plan.v);
      if (destroyed) {
        return;
      }
    }
    // Compute is already released; the retained volume is what still bills.
    if (plan.v) {
      await this.api.request("PUT", "/v1/volumes", {
        action: "delete",
        id: assertSafeId(plan.v, "volume id"),
        is_permanent: true,
      });
    }
  }

  async list(): Promise<ProviderInstance[]> {
    const { body } = await this.api.request<VerdaInstance[]>(
      "GET",
      "/v1/instances"
    );
    const instances = Array.isArray(body) ? body : [];
    return instances.map((instance) => ({
      providerRef: refFromInstance(instance),
      status: mapInstanceStatus(instance.status),
    }));
  }

  // --- Internals ----------------------------------------------------------

  private resultFor(instance: VerdaInstance): ProvisionResult {
    return {
      providerRef: refFromInstance(instance),
      wsUrl: `ws://${instance.ip}:${WORKER_PORT}`,
      status: "running",
      costUsd: instance.price_per_hour,
    };
  }

  /**
   * Pick the guest OS image. An explicit `osImage` is validated against the
   * live catalog (a typo would otherwise fail deep inside provisioning); with
   * none set, prefer an image that ships CUDA and Docker, which the bootstrap
   * script needs.
   */
  private async resolveOsImage(requested?: string): Promise<string> {
    const { body } = await this.api.request<VerdaOsImage[]>(
      "GET",
      "/v1/images"
    );
    const images = Array.isArray(body) ? body : [];
    const types = images
      .map((image) => image.image_type)
      .filter((type): type is string => Boolean(type));

    if (requested) {
      if (!types.includes(requested)) {
        throw new Error(
          `Verda OS image "${requested}" is not in the catalog. ` +
            `Available: ${types.join(", ")}`
        );
      }
      return requested;
    }

    const describes = (image: VerdaOsImage): string =>
      [image.image_type, image.name, ...(image.details ?? [])]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
    const preferred = images.find((image) => {
      const text = describes(image);
      return text.includes("cuda") && text.includes("docker");
    });
    const fallback = images.find((image) => describes(image).includes("docker"));
    const chosen = (preferred ?? fallback)?.image_type;
    if (!chosen) {
      throw new Error(
        "No Verda OS image with CUDA and Docker found. Set the profile's " +
          `osImage explicitly. Available: ${types.join(", ")}`
      );
    }
    return chosen;
  }

  /**
   * Resolve the required `location_code` against LIVE availability — a catalog
   * entry is not a reservation, so this is re-read immediately before each create.
   * An explicit region is verified rather than trusted.
   */
  private async resolveLocation(
    instanceType: string,
    requested?: string
  ): Promise<string> {
    const { body } = await this.api.request<
      Array<{ location_code?: string; availabilities?: string[] }>
    >("GET", "/v1/instance-availability");
    const rows = Array.isArray(body) ? body : [];
    const withType = rows.filter((row) =>
      (row.availabilities ?? []).includes(instanceType)
    );

    if (requested) {
      const match = withType.find((row) => row.location_code === requested);
      if (!match) {
        throw new Error(
          `Verda instance type "${instanceType}" is not available in ` +
            `"${requested}". Available in: ` +
            `${withType.map((r) => r.location_code).join(", ") || "no location"}`
        );
      }
      return requested;
    }

    const first = withType[0]?.location_code;
    if (!first) {
      throw new Error(
        `No Verda location currently has capacity for instance type ` +
          `"${instanceType}".`
      );
    }
    return first;
  }

  /** Register the spec's public key, reusing an identical existing key. */
  private async ensureSshKey(name: string, publicKey: string): Promise<string> {
    const key = publicKey.trim();
    const { body } = await this.api.request<
      Array<{ id?: string; key?: string }>
    >("GET", "/v1/sshkeys");
    const existing = Array.isArray(body)
      ? body.find((entry) => entry.key?.trim() === key)
      : undefined;
    if (existing?.id) {
      return existing.id;
    }
    const created = await this.api.request<unknown>("POST", "/v1/sshkeys", {
      name: `nodetool-${sanitizeHostname(name)}`,
      key,
    });
    return extractId(created.body, "SSH key");
  }

  /**
   * Create the startup script that turns a bare VM into a NodeTool worker.
   *
   * The script is idempotent: Verda runs it on every boot, including after a
   * resume, and it must not fail on a machine that already has the container.
   */
  private async createStartupScript(spec: WorkerSpec): Promise<string> {
    const env: Record<string, string> = { ...(spec.env ?? {}) };
    if (spec.token) {
      env.NODETOOL_WORKER_TOKEN = spec.token;
    }
    // Cache HF models on the OS volume so they survive a pause/resume.
    env.HF_HOME = WORKER_HF_HOME;

    const envFlags = Object.entries(env)
      .map(([key, value]) => `  -e ${shellQuote(`${key}=${value}`)} \\`)
      .join("\n");

    const script = `#!/bin/bash
# NodeTool worker bootstrap. Rerun-safe: Verda runs it on every boot.
set -euo pipefail

mkdir -p ${WORKER_HF_HOME}

# Reuse the container across reboots; only pull and create it when absent.
if docker inspect ${CONTAINER_NAME} >/dev/null 2>&1; then
  docker start ${CONTAINER_NAME}
  exit 0
fi

docker pull ${shellQuote(spec.image)}
docker run -d \\
  --name ${CONTAINER_NAME} \\
  --restart unless-stopped \\
  --gpus all \\
  -p ${WORKER_PORT}:${WORKER_PORT} \\
  -v ${WORKER_VOLUME_MOUNT}:${WORKER_VOLUME_MOUNT} \\
${envFlags}
  ${shellQuote(spec.image)}
`;

    const created = await this.api.request<unknown>("POST", "/v1/scripts", {
      name: `nodetool-${sanitizeHostname(spec.name)}-${Date.now()}`,
      script,
    });
    return extractId(created.body, "startup script");
  }

  /** `POST /v1/instances`, returning the accepted instance id. */
  private async createInstance(create: Record<string, unknown>): Promise<string> {
    try {
      const { body } = await this.api.request<unknown>(
        "POST",
        "/v1/instances",
        create
      );
      return extractId(body, "instance");
    } catch (err) {
      if (err instanceof VerdaApiError && err.isNoCapacity) {
        throw new Error(
          `Verda has no capacity for instance type ` +
            `"${String(create.instance_type)}" in "${String(create.location_code)}".`
        );
      }
      throw err;
    }
  }

  /**
   * Delete an instance together with every volume attached to it, permanently.
   *
   * The volume ids are read back from the instance and NAMED explicitly: an
   * empty `volume_ids` retains them all, and omitting the field deletes only
   * the OS volume while detaching the rest — both leave billable storage
   * behind. Returns false when the instance no longer exists.
   */
  private async destroyWithVolumes(
    instanceId: string,
    extraVolumeId?: string
  ): Promise<boolean> {
    const instance = await this.getInstance(instanceId);
    if (!instance) {
      return false;
    }
    const volumeIds = [
      ...new Set(
        [
          instance.os_volume_id,
          ...(instance.volume_ids ?? []),
          extraVolumeId,
        ].filter((id): id is string => Boolean(id))
      ),
    ];
    await this.deleteInstance(instanceId, { volumeIds, permanent: true });
    return true;
  }

  /**
   * `PUT /v1/instances` delete. `volumeIds: []` retains every attached volume;
   * a non-empty list deletes exactly those.
   */
  private async deleteInstance(
    instanceId: string,
    opts: { volumeIds: string[]; permanent: boolean }
  ): Promise<void> {
    const body: Record<string, unknown> = {
      action: "delete",
      id: assertSafeId(instanceId, "instance id"),
      volume_ids: opts.volumeIds.map((id) => assertSafeId(id, "volume id")),
    };
    if (opts.permanent && opts.volumeIds.length > 0) {
      body.delete_permanently = true;
    }
    const { status, body: result } = await this.api.request<
      Array<{ status?: string; message?: string }>
    >("PUT", "/v1/instances", body);

    // 204 means the action was already satisfied. 202 accepted it. 207 means a
    // bulk action partly failed — with a single id, that is a failure.
    if (status === 207) {
      const failure = Array.isArray(result)
        ? result.find((entry) => entry.status === "error")
        : undefined;
      throw new Error(
        `Verda refused to delete instance ${instanceId}: ` +
          `${failure?.message ?? "unknown error"}`
      );
    }
  }

  /** `GET /v1/instances/{id}`, or null when it no longer exists. */
  private async getInstance(id: string): Promise<VerdaInstance | null> {
    try {
      const { body } = await this.api.request<VerdaInstance>(
        "GET",
        `/v1/instances/${assertSafeId(id, "instance id")}`
      );
      // A deleted instance can answer 200 with the `notfound` status rather
      // than a 404, so both shapes are treated as gone.
      if (!body || body.status === "notfound") {
        return null;
      }
      return body;
    } catch (err) {
      if (err instanceof VerdaApiError && err.status === 404) {
        return null;
      }
      throw err;
    }
  }

  /** Poll until the instance reports `running`, or fail on a terminal state. */
  private async waitForReady(
    id: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<VerdaInstance> {
    const deadline = Date.now() + (opts.timeoutMs ?? 600_000);
    const intervalMs = opts.intervalMs ?? 10_000;
    let last: string | undefined;
    while (Date.now() < deadline) {
      const instance = await this.getInstance(id);
      last = instance?.status;
      const status = mapInstanceStatus(instance?.status);
      if (instance && status === "running") {
        return instance;
      }
      if (status === "error" || status === "terminated") {
        throw new Error(
          `Verda instance ${id} reached terminal status ` +
            `"${instance?.status ?? "deleted"}"`
        );
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(
      `Verda instance ${id} did not become ready within the timeout ` +
        `(last status: ${last ?? "unknown"})`
    );
  }
}

/** Pull a resource id out of a create response, which may be a bare string. */
function extractId(body: unknown, label: string): string {
  if (typeof body === "string" && body.trim()) {
    return body.trim().replace(/^"|"$/g, "");
  }
  if (body && typeof body === "object") {
    const id = (body as { id?: unknown }).id;
    if (typeof id === "string" && id) {
      return id;
    }
  }
  throw new Error(`Verda ${label} creation returned no id`);
}

/** Reduce a profile name to a valid hostname label. */
function sanitizeHostname(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
  return cleaned || "nodetool-worker";
}
