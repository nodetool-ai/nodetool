// Stateful fake of the RunPod REST v2 and Vast.ai v0 HTTP APIs, served
// through a `fetch` replacement. The provider-lifecycle harness installs it as
// the global `fetch`, so the real providers, the real transports and the real
// WorkerManager run unchanged against it.
//
// Response bodies follow the documented API shapes the providers read
// (RunPod: https://rest.runpod.io/v1/docs, Vast: https://console.vast.ai/api/v0)
// and carry only the fields the code reads plus a few the real API returns.
//
// Each pod or instance moves through its provider's states on reads, the way
// the real APIs report progress: a new RunPod pod reads PROVISIONING, then
// STARTING, then RUNNING; a new Vast instance reads `loading` until its
// configured poll count runs out. A request the fake does not route is
// answered 404 and recorded in `unexpected`, so a harness that asserts
// `unexpected` is empty fails closed on any call it did not plan for.

export const RUNPOD_BASE = "https://api.runpod.io/v2";
export const VAST_BASE = "https://console.vast.ai/api/v0";

export interface RecordedRequest {
  method: string;
  /** Path under the provider's API base, e.g. `runpod POST pods`. */
  call: string;
  body: unknown;
}

interface FakePod {
  id: string;
  name: string;
  image?: string;
  status: string;
  /** States still to report before the pod reads RUNNING. */
  pending: string[];
  cost: number;
  ports: string[];
  /** When set, the next read reports this terminal status. */
  failWith?: string;
}

interface FakeVastInstance {
  id: number;
  label: string;
  actual_status: string;
  /** `loading` reads still to report before the instance reads `running`. */
  loadingReads: number;
  failWith?: string;
}

export interface FakeProviderApiOptions {
  runpodKey?: string;
  vastKey?: string;
  /** Hourly cost of each new RunPod pod. */
  podCost?: number;
  /** Cheapest Vast offer returned by every search. */
  vastOffer?: { id: number; dph_total: number };
  /** `loading` reads a new or resumed Vast instance reports. */
  vastLoadingReads?: number;
}

export interface FakeProviderApi {
  fetch: typeof fetch;
  requests: RecordedRequest[];
  unexpected: RecordedRequest[];
  pods: Map<string, FakePod>;
  vastInstances: Map<number, FakeVastInstance>;
  /** Make the given pod report a terminal status on its next read. */
  failPod(id: string, status: "ERROR" | "TERMINATED"): void;
  /** Make the given Vast instance report a terminal status on its next read. */
  failVastInstance(id: number, status: "exited"): void;
  /** Add a pod created outside NodeTool (a billing orphan). */
  addOutOfBandPod(id: string): void;
  /** Remove a pod as if it was killed in the RunPod console. */
  killPodOutOfBand(id: string): void;
  /** The calls made so far, as `provider METHOD path` lines. */
  calls(): string[];
}

const POD_START_SEQUENCE = ["PROVISIONING", "STARTING", "RUNNING"];

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function podBody(pod: FakePod): Record<string, unknown> {
  const running = pod.status === "RUNNING";
  return {
    id: pod.id,
    name: pod.name,
    image: pod.image,
    desiredStatus: running ? "RUNNING" : pod.status,
    status: pod.status,
    costPerHr: pod.cost,
    cost: pod.cost,
    ports: pod.ports,
    runtime: running
      ? {
          uptime: 12,
          ports: [
            { private: 7777, public: 7777, type: "http", ip: null },
          ],
        }
      : null,
  };
}

function vastBody(instance: FakeVastInstance): Record<string, unknown> {
  const running = instance.actual_status === "running";
  return {
    id: instance.id,
    label: instance.label,
    actual_status: instance.actual_status,
    intended_status: running ? "running" : instance.actual_status,
    public_ipaddr: running ? "198.51.100.23" : null,
    ports: running
      ? { "7777/tcp": [{ HostIp: "0.0.0.0", HostPort: "41021" }] }
      : null,
  };
}

export function createFakeProviderApi(
  options: FakeProviderApiOptions = {}
): FakeProviderApi {
  const runpodKey = options.runpodKey ?? "fixture-runpod-key";
  const vastKey = options.vastKey ?? "fixture-vast-key";
  const podCost = options.podCost ?? 0.39;
  const vastOffer = options.vastOffer ?? { id: 4242, dph_total: 0.42 };
  const vastLoadingReads = options.vastLoadingReads ?? 2;

  const requests: RecordedRequest[] = [];
  const unexpected: RecordedRequest[] = [];
  const pods = new Map<string, FakePod>();
  const vastInstances = new Map<number, FakeVastInstance>();
  let podSeq = 0;
  let vastSeq = 9000;

  function readPod(pod: FakePod): FakePod {
    if (pod.failWith) {
      pod.status = pod.failWith;
      pod.failWith = undefined;
      pod.pending = [];
    } else if (pod.pending.length > 0) {
      pod.status = pod.pending.shift()!;
    }
    return pod;
  }

  function readVast(instance: FakeVastInstance): FakeVastInstance {
    if (instance.failWith) {
      instance.actual_status = instance.failWith;
      instance.failWith = undefined;
    } else if (instance.actual_status === "loading") {
      if (instance.loadingReads > 0) {
        instance.loadingReads -= 1;
      } else {
        instance.actual_status = "running";
      }
    }
    return instance;
  }

  function routeRunpod(method: string, path: string, body: unknown): Response | null {
    if (method === "POST" && path === "pods") {
      const spec = body as { name: string; image?: string; ports?: string[] };
      podSeq += 1;
      const pod: FakePod = {
        id: `fxpod${podSeq}`,
        name: spec.name,
        image: spec.image,
        status: "CREATED",
        pending: [...POD_START_SEQUENCE],
        cost: podCost,
        ports: spec.ports ?? [],
      };
      pods.set(pod.id, pod);
      return json(podBody(pod), 201);
    }
    if (method === "GET" && path === "pods") {
      return json([...pods.values()].map((pod) => ({ ...podBody(pod), runtime: null })));
    }
    const action = /^pods\/([^/]+)\/action$/.exec(path);
    if (method === "POST" && action) {
      const pod = pods.get(action[1]);
      if (!pod) return json({ error: "pod not found" }, 404);
      const kind = (body as { action?: string }).action;
      if (kind === "stop") {
        pod.status = "EXITED";
        pod.pending = [];
        return json({});
      }
      if (kind === "start") {
        pod.status = "STARTING";
        pod.pending = ["STARTING", "RUNNING"];
        return json({});
      }
      return null;
    }
    const one = /^pods\/([^/]+)$/.exec(path);
    if (one) {
      const pod = pods.get(one[1]);
      if (!pod) return json({ error: "pod not found" }, 404);
      if (method === "GET") return json(podBody(readPod(pod)));
      if (method === "DELETE") {
        pods.delete(pod.id);
        return new Response(null, { status: 204 });
      }
    }
    return null;
  }

  function routeVast(method: string, path: string, body: unknown): Response | null {
    if (method === "PUT" && path === "bundles/") {
      return json({ offers: [vastOffer, { id: vastOffer.id + 1, dph_total: vastOffer.dph_total * 2 }] });
    }
    const ask = /^asks\/(\d+)\/$/.exec(path);
    if (method === "PUT" && ask) {
      if (Number(ask[1]) !== vastOffer.id) {
        return json({ success: false, error: "no_such_ask" }, 404);
      }
      vastSeq += 1;
      const instance: FakeVastInstance = {
        id: vastSeq,
        label: (body as { label?: string }).label ?? "",
        actual_status: "loading",
        loadingReads: vastLoadingReads,
      };
      vastInstances.set(instance.id, instance);
      return json({ success: true, new_contract: instance.id });
    }
    if (method === "GET" && path === "instances/") {
      return json({ instances: [...vastInstances.values()].map(vastBody) });
    }
    const one = /^instances\/(\d+)\/$/.exec(path);
    if (one) {
      const instance = vastInstances.get(Number(one[1]));
      if (!instance) return json({ success: false, error: "no_such_instance" }, 404);
      if (method === "GET") return json({ instances: vastBody(readVast(instance)) });
      if (method === "DELETE") {
        vastInstances.delete(instance.id);
        return json({ success: true });
      }
      if (method === "PUT") {
        const state = (body as { state?: string }).state;
        if (state === "stopped") {
          instance.actual_status = "stopped";
          return json({ success: true });
        }
        if (state === "running") {
          instance.actual_status = "loading";
          instance.loadingReads = vastLoadingReads;
          return json({ success: true });
        }
      }
    }
    return null;
  }

  const fakeFetch = async (
    input: string | URL | Request,
    init?: RequestInit
  ): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    const auth = new Headers(init?.headers).get("Authorization");

    let provider: "runpod" | "vast" | null = null;
    let path = "";
    if (url.startsWith(`${RUNPOD_BASE}/`)) {
      provider = "runpod";
      path = url.slice(RUNPOD_BASE.length + 1);
    } else if (url.startsWith(`${VAST_BASE}/`)) {
      provider = "vast";
      path = url.slice(VAST_BASE.length + 1);
    }
    const record: RecordedRequest = {
      method,
      call: `${provider ?? "unknown"} ${method} ${path || url}`,
      body,
    };
    requests.push(record);

    if (!provider) {
      unexpected.push(record);
      return json({ error: `no fake for ${url}` }, 404);
    }
    const expectedKey = provider === "runpod" ? runpodKey : vastKey;
    if (auth !== `Bearer ${expectedKey}`) {
      unexpected.push(record);
      return json({ error: "unauthorized" }, 401);
    }
    const response =
      provider === "runpod"
        ? routeRunpod(method, path, body)
        : routeVast(method, path, body);
    if (!response) {
      unexpected.push(record);
      return json({ error: `no route for ${method} ${path}` }, 404);
    }
    return response;
  };

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    unexpected,
    pods,
    vastInstances,
    failPod(id, status) {
      const pod = pods.get(id);
      if (!pod) throw new Error(`fake: no pod ${id}`);
      pod.failWith = status;
    },
    failVastInstance(id, status) {
      const instance = vastInstances.get(id);
      if (!instance) throw new Error(`fake: no Vast instance ${id}`);
      instance.failWith = status;
    },
    addOutOfBandPod(id) {
      pods.set(id, {
        id,
        name: "created-in-console",
        status: "RUNNING",
        pending: [],
        cost: podCost,
        ports: [],
      });
    },
    killPodOutOfBand(id) {
      pods.delete(id);
    },
    calls() {
      return requests.map((request) => request.call);
    },
  };
}
