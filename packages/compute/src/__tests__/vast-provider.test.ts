import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VastProvider } from "../providers/vast.js";
import type { WorkerSpec } from "../providers/types.js";

// ---------------------------------------------------------------------------
// Setup — mock the global fetch the Vast HTTP transport uses.
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

const API_KEY = "test-vast-key";

function baseSpec(overrides: Partial<WorkerSpec> = {}): WorkerSpec {
  return {
    name: "hf-worker",
    image: "ghcr.io/nodetool-ai/worker:0.7.3",
    target: "vast",
    gpu: "RTX_4090",
    token: "worker-secret",
    ...overrides,
  };
}

/** A ready instance object as returned by GET /instances/{id}/. */
function readyInstance(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    id: 9001,
    actual_status: "running",
    public_ipaddr: "203.0.113.7",
    ports: {
      "7777/tcp": [{ HostIp: "0.0.0.0", HostPort: "41021" }],
    },
    ...overrides,
  };
}

describe("VastProvider.provision", () => {
  it("searches an offer, launches the spec image, polls until ready, and returns the attach handoff", async () => {
    // 1) PUT /bundles/ (offer search) → an offer matching the GPU
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ offers: [{ id: 555, gpu_name: "RTX 4090" }] })
    );
    // 2) PUT /asks/555/ → launched, new contract id
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, new_contract: 9001 })
    );
    // 3) GET /instances/9001/ → running with a public ip + port map
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: readyInstance() })
    );

    const provider = new VastProvider(API_KEY);
    const result = await provider.provision(baseSpec());

    expect(result).toEqual({
      providerRef: "9001",
      wsUrl: "ws://203.0.113.7:41021",
      token: "worker-secret",
      status: "running",
    });

    // The launch call targets the searched offer and runs the spec image with
    // the worker token forwarded as env.
    const [launchUrl, launchInit] = mockFetch.mock.calls[1];
    expect(launchUrl).toBe("https://console.vast.ai/api/v0/asks/555/");
    expect((launchInit as RequestInit).method).toBe("PUT");
    const launchBody = JSON.parse((launchInit as RequestInit).body as string);
    expect(launchBody.image).toBe("ghcr.io/nodetool-ai/worker:0.7.3");
    expect(launchBody.env.NODETOOL_WORKER_TOKEN).toBe("worker-secret");
  });

  it("destroys the launched instance when it never becomes reachable", async () => {
    // 1) PUT /bundles/ → an offer matching the GPU
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ offers: [{ id: 555, gpu_name: "RTX 4090" }] })
    );
    // 2) PUT /asks/555/ → launched, new contract id (billing now active)
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, new_contract: 9001 })
    );
    // 3) GET /instances/9001/ → terminal "exited" makes waitForReady throw
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: { id: 9001, actual_status: "exited" } })
    );
    // 4) DELETE /instances/9001/ → cleanup teardown
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    const provider = new VastProvider(API_KEY);
    await expect(provider.provision(baseSpec())).rejects.toThrow(
      /terminal status/
    );

    // The launched instance must be destroyed so it stops billing.
    const [destroyUrl, destroyInit] = mockFetch.mock.calls[3];
    expect(destroyUrl).toBe("https://console.vast.ai/api/v0/instances/9001/");
    expect((destroyInit as RequestInit).method).toBe("DELETE");
  });

  it("destroys the launched instance when it runs without a reachable port", async () => {
    // 1) PUT /bundles/ → an offer matching the GPU
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ offers: [{ id: 555, gpu_name: "RTX 4090" }] })
    );
    // 2) PUT /asks/555/ → launched
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, new_contract: 9001 })
    );
    // 3) GET /instances/9001/ → running but no port mapping exposed
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        instances: readyInstance({ ports: null }),
      })
    );
    // 4) DELETE /instances/9001/ → cleanup teardown
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    const provider = new VastProvider(API_KEY);
    await expect(provider.provision(baseSpec())).rejects.toThrow(
      /port mapping/
    );

    const [destroyUrl, destroyInit] = mockFetch.mock.calls[3];
    expect(destroyUrl).toBe("https://console.vast.ai/api/v0/instances/9001/");
    expect((destroyInit as RequestInit).method).toBe("DELETE");
  });

  it("reports the chosen offer's hourly cost from dph_total", async () => {
    // 1) PUT /bundles/ → the cheapest offer carries its dollars-per-hour total.
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        offers: [{ id: 555, gpu_name: "RTX 4090", dph_total: 0.31 }],
      })
    );
    // 2) PUT /asks/555/ → launched
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ success: true, new_contract: 9001 })
    );
    // 3) GET /instances/9001/ → running
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: readyInstance() })
    );

    const provider = new VastProvider(API_KEY);
    const result = await provider.provision(baseSpec());

    expect(result.costUsd).toBe(0.31);
  });
});

describe("VastProvider.status", () => {
  it("maps Vast instance states to WorkerStatus", async () => {
    const provider = new VastProvider(API_KEY);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: { actual_status: "running" } })
    );
    expect(await provider.status("9001")).toBe("running");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: { actual_status: "loading" } })
    );
    expect(await provider.status("9001")).toBe("provisioning");

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ instances: { actual_status: "exited" } })
    );
    expect(await provider.status("9001")).toBe("stopped");
  });
});

describe("VastProvider.stop", () => {
  it("issues the real DELETE to destroy the instance", async () => {
    mockFetch.mockResolvedValueOnce(jsonResponse({ success: true }));

    const provider = new VastProvider(API_KEY);
    await provider.stop("9001");

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://console.vast.ai/api/v0/instances/9001/");
    expect((init as RequestInit).method).toBe("DELETE");
  });
});

describe("VastProvider.list", () => {
  it("returns the live instances as ProviderInstance[]", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse({
        instances: [
          { id: 1, actual_status: "running" },
          { id: 2, actual_status: "exited" },
        ],
      })
    );

    const provider = new VastProvider(API_KEY);
    const instances = await provider.list();

    expect(instances).toEqual([
      { providerRef: "1", status: "running" },
      { providerRef: "2", status: "stopped" },
    ]);
  });
});
