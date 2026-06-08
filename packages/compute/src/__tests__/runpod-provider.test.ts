import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { RunpodPodProvider } from "../providers/runpod.js";
import type { WorkerSpec } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Setup — mock the global fetch the RunPod REST transport uses.
// ---------------------------------------------------------------------------

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

function jsonResponse(body: unknown, status = 200, ok = true): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    headers: new Headers(),
  } as unknown as Response;
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
    image: "ghcr.io/nodetool-ai/worker:0.7.3",
    target: "runpod",
    token: "worker-secret",
    ...overrides,
  };
}

describe("RunpodPodProvider.provision", () => {
  it("creates a pod from the spec image, polls until running, and returns the attach handoff", async () => {
    // 1) POST /v1/pods → created pod (initializing)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", desiredStatus: "EXITED" })
    );
    // 2) GET /v1/pods/pod-123 → RUNNING
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "pod-123", desiredStatus: "RUNNING" })
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
    const [, createInit] = mockFetch.mock.calls[0];
    const createBody = JSON.parse((createInit as RequestInit).body as string);
    expect(createBody.imageName).toBe("ghcr.io/nodetool-ai/worker:0.7.3");
    expect(createBody.env.NODETOOL_WORKER_TOKEN).toBe("worker-secret");
  });
});

describe("RunpodPodProvider.status", () => {
  it("maps RunPod pod states to WorkerStatus", async () => {
    const provider = new RunpodPodProvider(API_KEY);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", desiredStatus: "RUNNING" })
    );
    expect(await provider.status("p")).toBe("running");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", desiredStatus: "EXITED" })
    );
    expect(await provider.status("p")).toBe("stopped");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ id: "p", desiredStatus: "TERMINATED" })
    );
    expect(await provider.status("p")).toBe("stopped");
  });
});

describe("RunpodPodProvider.stop", () => {
  it("issues the real DELETE to tear the pod down", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({}, 204));

    const provider = new RunpodPodProvider(API_KEY);
    await provider.stop("pod-xyz");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://rest.runpod.io/v1/pods/pod-xyz");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("RunpodPodProvider.list", () => {
  it("returns the live pods as ProviderInstance[]", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse([
        { id: "pod-a", desiredStatus: "RUNNING" },
        { id: "pod-b", desiredStatus: "EXITED" },
      ])
    );

    const provider = new RunpodPodProvider(API_KEY);
    const instances = await provider.list();

    expect(instances).toEqual([
      { providerRef: "pod-a", status: "running" },
      { providerRef: "pod-b", status: "stopped" },
    ]);
  });
});
