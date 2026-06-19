// Vast.ai-backed `WorkerProvider`.
//
// Launches the NodeTool worker image on a Vast.ai GPU offer over the Vast HTTP
// API (https://console.vast.ai/api/v0), polls the instance to `running`, and
// derives the direct `ws://<ip>:<port>` URL the bridge attaches to.
//
// Lifecycle mirrors RunPod: `stop` PAUSES the instance (state→stopped, its disk
// and model cache are retained), `resume` brings it back (state→running), and
// `terminate` DELETEs it for good — the real teardown that stops all billing.
//
// The API key is injected via the constructor (sourced from the secret store /
// env by the `WorkerManager`); this provider never reads `process.env`.

import {
  DEFAULT_VOLUME_GB,
  WORKER_HF_HOME,
  type ProviderInstance,
  type ProvisionResult,
  type WorkerProvider,
  type WorkerSpec,
  type WorkerStatus,
} from "./types.js";

const VAST_API_BASE_URL = "https://console.vast.ai/api/v0";

/** Internal port the worker serves on. */
const WORKER_PORT = 7777;

type HttpMethod = "GET" | "PUT" | "DELETE";

/** A Vast.ai instance as returned by the API (fields we read). */
interface VastInstance {
  id?: number;
  /** Live state: "loading" → "running" → "exited"/"stopped". */
  actual_status?: string;
  /** Public IPv4; empty/null while the instance is loading. */
  public_ipaddr?: string | null;
  /** Docker port bindings, e.g. {"7777/tcp": [{HostPort: "41021"}]}. */
  ports?: Record<string, Array<{ HostPort?: string }>> | null;
  [k: string]: unknown;
}

/**
 * Call the Vast HTTP API with an explicitly-supplied key. Mirrors the RunPod
 * REST transport: explicit key (never `process.env`), bearer auth, JSON body.
 */
async function vastApi(
  apiKey: string,
  endpoint: string,
  method: HttpMethod = "GET",
  data?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  if (!apiKey) throw new Error("Vast.ai API key is required");
  const init: RequestInit = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    signal: AbortSignal.timeout(60_000),
  };
  if (data && method !== "GET") init.body = JSON.stringify(data);

  const response = await fetch(`${VAST_API_BASE_URL}/${endpoint}`, init);
  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Vast.ai ${method} /${endpoint} failed (${response.status}): ${body}`
    );
  }
  const text = await response.text();
  return text ? (JSON.parse(text) as Record<string, unknown>) : {};
}

/** Map a Vast instance's `actual_status` to the shared `WorkerStatus`. */
function mapInstanceStatus(status: string | undefined): WorkerStatus {
  switch (status) {
    case "running":
      return "running";
    case "exited":
    case "stopped":
      return "stopped";
    default:
      return "provisioning";
  }
}

/** Resolve the host port mapped to the worker's internal port, if exposed. */
function externalPort(instance: VastInstance): string | null {
  const binding = instance.ports?.[`${WORKER_PORT}/tcp`];
  return binding?.[0]?.HostPort ?? null;
}

export class VastProvider implements WorkerProvider {
  constructor(private readonly apiKey: string) {}

  async provision(spec: WorkerSpec): Promise<ProvisionResult> {
    const offer = await this.findOffer(spec);
    const instanceId = await this.launch(offer.id, spec);

    // `launch` created a billing instance. Any failure past this point must
    // DESTROY it, otherwise the orphaned GPU bills until the reconcile scan
    // detects it — its `provider_ref` is never persisted, so the manager can't
    // tear it down.
    try {
      const instance = await this.waitForReady(instanceId);

      const ip = instance.public_ipaddr;
      const port = externalPort(instance);
      if (!ip || !port) {
        throw new Error(
          `Vast instance ${instanceId} became running without a reachable ` +
            `${WORKER_PORT} port mapping`
        );
      }

      return {
        providerRef: instanceId,
        wsUrl: `ws://${ip}:${port}`,
        token: spec.token,
        status: "running",
        costUsd: offer.dphTotal,
      };
    } catch (err) {
      await this.terminate(instanceId).catch(() => {
        // Best-effort teardown; surface the original provision failure below.
      });
      throw err;
    }
  }

  async status(ref: string): Promise<WorkerStatus> {
    const instance = await this.getInstance(ref);
    return mapInstanceStatus(instance.actual_status);
  }

  /** Pause: stop the instance but keep its disk (and model cache). */
  async stop(ref: string): Promise<void> {
    await vastApi(this.apiKey, `instances/${ref}/`, "PUT", {
      state: "stopped",
    });
  }

  /** Resume a stopped instance and re-derive its (possibly new) endpoint. */
  async resume(ref: string): Promise<ProvisionResult> {
    await vastApi(this.apiKey, `instances/${ref}/`, "PUT", {
      state: "running",
    });
    const instance = await this.waitForReady(ref);
    const ip = instance.public_ipaddr;
    const port = externalPort(instance);
    if (!ip || !port) {
      throw new Error(
        `Vast instance ${ref} resumed without a reachable ${WORKER_PORT} port`
      );
    }
    return {
      providerRef: ref,
      wsUrl: `ws://${ip}:${port}`,
      status: "running",
    };
  }

  /** Destroy the instance and its disk — real teardown, stops all billing. */
  async terminate(ref: string): Promise<void> {
    await vastApi(this.apiKey, `instances/${ref}/`, "DELETE");
  }

  async list(): Promise<ProviderInstance[]> {
    const res = await vastApi(this.apiKey, "instances/");
    const arr = (res as { instances?: unknown }).instances;
    const instances = Array.isArray(arr) ? (arr as VastInstance[]) : [];
    return instances.map((instance) => ({
      providerRef: String(instance.id),
      status: mapInstanceStatus(instance.actual_status),
    }));
  }

  // --- Internals ----------------------------------------------------------

  /**
   * Search the marketplace for the cheapest rentable offer matching the spec's
   * GPU. Returns the offer id plus its `dph_total` (total dollars-per-hour), the
   * estimated cost the cost guard records on the instance.
   */
  private async findOffer(
    spec: WorkerSpec
  ): Promise<{ id: string; dphTotal: number | undefined }> {
    const query: Record<string, unknown> = {
      rentable: { eq: true },
      verified: { eq: true },
      rented: { eq: false },
    };
    if (spec.gpu) {
      query.gpu_name = { eq: spec.gpu };
    }
    const res = await vastApi(this.apiKey, "bundles/", "PUT", {
      q: query,
      order: [["dph_total", "asc"]],
    });
    const offers = (res as { offers?: unknown }).offers;
    const first = Array.isArray(offers)
      ? (offers[0] as { id?: number; dph_total?: number } | undefined)
      : undefined;
    if (!first?.id) {
      throw new Error(
        `No rentable Vast.ai offer found for GPU "${spec.gpu ?? "any"}"`
      );
    }
    return { id: String(first.id), dphTotal: first.dph_total };
  }

  /** Launch the worker image on the chosen offer; return the new contract id. */
  private async launch(offerId: string, spec: WorkerSpec): Promise<string> {
    const env: Record<string, string> = { ...(spec.env ?? {}) };
    if (spec.token) env.NODETOOL_WORKER_TOKEN = spec.token;
    // Cache HF models on the instance disk so they survive a stop/resume.
    env.HF_HOME = WORKER_HF_HOME;

    const res = await vastApi(this.apiKey, `asks/${offerId}/`, "PUT", {
      image: spec.image,
      disk: spec.disk ?? DEFAULT_VOLUME_GB,
      env,
      // Map the worker's internal port out for the direct ws:// attach.
      runtype: "args",
      args: ["-p", `${WORKER_PORT}:${WORKER_PORT}`],
    });
    // The launch response is `{success, new_contract}` per the Vast HTTP API
    // (https://console.vast.ai/api/v0). On failure it carries `error`/`message`
    // instead, so include the whole body to keep the failure debuggable.
    const contract = (res as { new_contract?: number }).new_contract;
    if (!contract) {
      throw new Error(
        `Vast.ai launch returned no instance id: ${JSON.stringify(res)}`
      );
    }
    return String(contract);
  }

  /** Poll GET /instances/{id}/ until `running`. */
  private async waitForReady(
    id: string,
    opts: { timeoutMs?: number; intervalMs?: number } = {}
  ): Promise<VastInstance> {
    const deadline = Date.now() + (opts.timeoutMs ?? 240_000);
    const intervalMs = opts.intervalMs ?? 5_000;
    let last: VastInstance | undefined;
    while (Date.now() < deadline) {
      const instance = await this.getInstance(id);
      last = instance;
      const status = mapInstanceStatus(instance.actual_status);
      if (status === "running") return instance;
      if (status === "stopped") {
        throw new Error(
          `Vast instance ${id} reached terminal status ${instance.actual_status}`
        );
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error(
      `Vast instance ${id} did not become reachable within the timeout ` +
        `(last status: ${last?.actual_status ?? "unknown"})`
    );
  }

  private async getInstance(id: string): Promise<VastInstance> {
    const res = await vastApi(this.apiKey, `instances/${id}/`);
    const instance = (res as { instances?: unknown }).instances;
    return (instance ?? {}) as VastInstance;
  }
}
