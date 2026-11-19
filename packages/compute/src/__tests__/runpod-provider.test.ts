import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunpodPodProvider } from "../providers/runpod.js";
import type { WorkerSpec } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Setup — mock the global fetch the RunPod REST transport uses.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  const partial: Pick<Response, "ok" | "status" | "json" | "text" | "headers"> =
    {
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
      headers: new Headers(),
    };
  // SAFETY: the code under test reads only ok/status/json/text/headers.
  return partial as Response;
}

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const API_KEY = "test-runpod-key";

function baseSpec(overrides: Partial<WorkerSpec> = {}): WorkerSpec {
  return {
    name: "hf-worker",
    image: "ghcr.io/nodetool-ai/nodetool-worker:0.7.3",
    target: "runpod",
    token: "worker-secret",
    ...overrides,
  };
}

describe("RunpodPodProvider.provision", () => {
  it("creates a pod from the spec image, polls until running, and returns the attach handoff", async () => {
    // 1) POST /v2/pods → created pod (initializing)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "PROVISIONING" })
    );
    // 2) GET /v2/pods/pod-123 → RUNNING
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "RUNNING" })
    );

    const provider = new RunpodPodProvider(API_KEY);
    const result = await provider.provision(baseSpec());

    expect(result).toEqual({
      providerRef: "pod-123",
      wsUrl: "wss://pod-123-7777.proxy.runpod.net",
      token: "worker-secret",
      status: "running",
    });

    // The create call uses the spec image and passes the token as worker env.
    const [createUrl, createInit] = mockFetch.mock.calls[0];
    expect(createUrl).toBe("https://api.runpod.io/v2/pods");
    const createBody = JSON.parse((createInit as RequestInit).body as string);
    expect(createBody.image).toBe("ghcr.io/nodetool-ai/nodetool-worker:0.7.3");
    expect(createBody.env.NODETOOL_WORKER_TOKEN).toBe("worker-secret");
  });

  it("deletes the created pod when polling fails before RUNNING (no billing orphan)", async () => {
    // 1) POST /v2/pods → pod is created (billing starts), still initializing.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-orphan", status: "PROVISIONING" })
    );
    // 2) GET /v2/pods/pod-orphan → terminal status, so polling throws.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-orphan", status: "TERMINATED" })
    );
    // 3) DELETE /v2/pods/pod-orphan → cleanup teardown succeeds.
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 204));

    const provider = new RunpodPodProvider(API_KEY);
    await expect(provider.provision(baseSpec())).rejects.toThrow(
      /terminal status/
    );

    // The created pod must be torn down so it stops billing.
    const deleteCall = mockFetch.mock.calls.find(
      ([url, init]) =>
        url === "https://api.runpod.io/v2/pods/pod-orphan" &&
        (init as RequestInit | undefined)?.method === "DELETE"
    );
    expect(deleteCall).toBeDefined();
  });

  it("reports the pod's hourly cost from cost", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "PROVISIONING" })
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "RUNNING", cost: 0.44 })
    );

    const provider = new RunpodPodProvider(API_KEY);
    const result = await provider.provision(baseSpec());

    expect(result.costUsd).toBe(0.44);
  });

  it("provisions a persistent volume on GPU pods and points HF_HOME at it", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "PROVISIONING" })
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "RUNNING" })
    );

    const provider = new RunpodPodProvider(API_KEY);
    await provider.provision(
      baseSpec({ gpu: "NVIDIA GeForce RTX 4090", disk: 200 })
    );

    const createBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(createBody.mounts).toEqual({
      persistent: { size: 200, path: "/workspace" },
    });
    expect(createBody.env.HF_HOME).toBe("/workspace/huggingface");
  });

  it("defaults the volume size on GPU pods when the spec omits disk", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "PROVISIONING" })
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", status: "RUNNING" })
    );

    const provider = new RunpodPodProvider(API_KEY);
    await provider.provision(baseSpec({ gpu: "NVIDIA GeForce RTX 4090" }));

    const createBody = JSON.parse(
      (mockFetch.mock.calls[0][1] as RequestInit).body as string
    );
    expect(createBody.mounts).toEqual({
      persistent: { size: 100, path: "/workspace" },
    }); // DEFAULT_VOLUME_GB
  });
});

describe("RunpodPodProvider.status", () => {
  it("maps RunPod pod states to WorkerStatus", async () => {
    const provider = new RunpodPodProvider(API_KEY);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", status: "RUNNING" })
    );
    expect(await provider.status("p")).toBe("running");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", status: "EXITED" })
    );
    expect(await provider.status("p")).toBe("stopped");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", status: "TERMINATED" })
    );
    expect(await provider.status("p")).toBe("stopped");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", status: "ERROR" })
    );
    expect(await provider.status("p")).toBe("error");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", status: "STARTING" })
    );
    expect(await provider.status("p")).toBe("provisioning");
  });
});

describe("RunpodPodProvider.stop", () => {
  it("pauses the pod (POST /action stop), keeping the volume", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}));

    const provider = new RunpodPodProvider(API_KEY);
    await provider.stop("pod-xyz");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.runpod.io/v2/pods/pod-xyz/action");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      action: "stop",
    });
  });
});

describe("RunpodPodProvider.terminate", () => {
  it("issues the real DELETE to destroy the pod and its volume", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 204));

    const provider = new RunpodPodProvider(API_KEY);
    await provider.terminate("pod-xyz");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://api.runpod.io/v2/pods/pod-xyz");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("RunpodPodProvider.resume", () => {
  it("starts the pod (POST /action start) and re-derives the proxy ws URL", async () => {
    // POST /action start, then GET /pods/{id} → RUNNING.
    mockFetch.mockResolvedValueOnce(jsonResponse({}));
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-xyz", status: "RUNNING", cost: 0.4 })
    );

    const provider = new RunpodPodProvider(API_KEY);
    const result = await provider.resume("pod-xyz");

    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.runpod.io/v2/pods/pod-xyz/action"
    );
    expect((mockFetch.mock.calls[0][1] as RequestInit).method).toBe("POST");
    expect(
      JSON.parse((mockFetch.mock.calls[0][1] as RequestInit).body as string)
    ).toEqual({ action: "start" });
    expect(result.providerRef).toBe("pod-xyz");
    expect(result.wsUrl).toBe("wss://pod-xyz-7777.proxy.runpod.net");
    expect(result.status).toBe("running");
    expect(result.costUsd).toBe(0.4);
  });
});

describe("RunpodPodProvider.list", () => {
  it("returns the live pods as ProviderInstance[]", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        pods: [
          { id: "pod-a", status: "RUNNING" },
          { id: "pod-b", status: "EXITED" },
        ],
        pagination: { hasNextPage: false, nextCursor: null },
      })
    );

    const provider = new RunpodPodProvider(API_KEY);
    const instances = await provider.list();

    expect(instances).toEqual([
      { providerRef: "pod-a", status: "running" },
      { providerRef: "pod-b", status: "stopped" },
    ]);
  });
});
