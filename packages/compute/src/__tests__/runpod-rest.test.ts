import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CPU_FLAVOR_ID,
  DEFAULT_CPU_VCPU_COUNT,
  DEFAULT_GPU_COUNT,
  DEFAULT_RUNPOD_REST_BASE_URL,
  WORKER_MIN_CUDA_VERSION,
  deployWorkerPod,
  getRunpodRestBaseUrl,
  listPods,
  podDirectWsUrl,
  startPod,
  stopPod,
} from "../providers/runpod-rest.js";

// ---------------------------------------------------------------------------
// Mock the global fetch the RunPod REST transport uses.
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

const originalBaseUrl = process.env.RUNPOD_REST_BASE_URL;

beforeEach(() => {
  mockFetch.mockReset();
  delete process.env.RUNPOD_REST_BASE_URL;
});

afterEach(() => {
  if (originalBaseUrl === undefined) {
    delete process.env.RUNPOD_REST_BASE_URL;
  } else {
    process.env.RUNPOD_REST_BASE_URL = originalBaseUrl;
  }
  vi.restoreAllMocks();
});

const API_KEY = "test-runpod-key";

/** First fetch is the POST /v2/pods create; subsequent are the RUNNING poll. */
function mockCreateThenRunning() {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: "pod-1" }))
    .mockResolvedValue(
      jsonResponse({ id: "pod-1", status: "RUNNING" })
    );
}

/** Parse the JSON body sent to the create-pod POST. */
function createBody(): Record<string, unknown> {
  const call = mockFetch.mock.calls[0];
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("getRunpodRestBaseUrl", () => {
  it("defaults to RunPod REST API v2", () => {
    expect(getRunpodRestBaseUrl()).toBe(DEFAULT_RUNPOD_REST_BASE_URL);
    expect(getRunpodRestBaseUrl()).toBe("https://api.runpod.io/v2");
  });

  it("honors RUNPOD_REST_BASE_URL and strips trailing slashes", async () => {
    process.env.RUNPOD_REST_BASE_URL = "https://custom.runpod.example/v3///";
    expect(getRunpodRestBaseUrl()).toBe("https://custom.runpod.example/v3");

    mockFetch.mockResolvedValueOnce(jsonResponse({ pods: [] }));
    await listPods(API_KEY);
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://custom.runpod.example/v3/pods"
    );
  });
});

describe("deployWorkerPod GPU spec", () => {
  it("sends nested v2 gpu config with default count and omits cpu", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeId: "NVIDIA GeForce RTX 4090",
    });

    expect(mockFetch.mock.calls[0][0]).toBe("https://api.runpod.io/v2/pods");
    const body = createBody();
    expect(body.image).toBe("img");
    expect(body.imageName).toBeUndefined();
    expect(body.computeType).toBeUndefined();
    expect(body.cpu).toBeUndefined();
    expect(body.gpu).toEqual({
      id: "NVIDIA GeForce RTX 4090",
      count: DEFAULT_GPU_COUNT,
      minCudaVersion: WORKER_MIN_CUDA_VERSION,
    });
  });

  it("limits GPU pods to hosts whose driver runs CUDA 13.0 or newer", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeIds: ["NVIDIA GeForce RTX 4090"],
    });

    const gpu = createBody().gpu as Record<string, unknown>;
    expect(gpu.minCudaVersion).toBe("13.0");
    expect(gpu.allowedCudaVersions).toBeUndefined();
    expect(WORKER_MIN_CUDA_VERSION).toBe("13.0");
  });

  it("falls back from default SECURE cloud to COMMUNITY on v2 capacity error", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse(
          {
            detail:
              "There are no longer any instances available with the requested specifications. Please refresh and try again.",
            status: 400,
            title: "Bad Request",
          },
          400,
          false
        )
      )
      .mockResolvedValueOnce(jsonResponse({ id: "pod-community" }))
      .mockResolvedValueOnce(
        jsonResponse({ id: "pod-community", status: "RUNNING" })
      );

    const deployed = await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeId: "NVIDIA A40",
    });

    expect(deployed.podId).toBe("pod-community");
    const firstBody = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    const retryBody = JSON.parse(String(mockFetch.mock.calls[1][1].body));
    expect(firstBody.cloud).toBeUndefined();
    expect(retryBody.cloud).toBe("COMMUNITY");
  });

  it("does not fall back when cloud is explicitly pinned", async () => {
    mockFetch.mockResolvedValueOnce(
      jsonResponse(
        {
          detail:
            "There are no longer any instances available with the requested specifications.",
          status: 400,
          title: "Bad Request",
        },
        400,
        false
      )
    );

    await expect(
      deployWorkerPod(API_KEY, {
        name: "gpu-worker",
        image: "img",
        computeType: "GPU",
        gpuTypeId: "NVIDIA A40",
        cloud: "SECURE",
      })
    ).rejects.toThrow(/no longer any instances/i);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("rejects GPU pods without a GPU type id", async () => {
    await expect(
      deployWorkerPod(API_KEY, {
        name: "gpu-worker",
        image: "img",
        computeType: "GPU",
      })
    ).rejects.toThrow(/GPU type id/);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("honors explicit gpuCount and converts vcpuCount to minVcpuCountPerGpu", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeId: "NVIDIA H100",
      gpuCount: 4,
      vcpuCount: 32,
    });

    const gpu = createBody().gpu as Record<string, unknown>;
    expect(gpu.id).toBe("NVIDIA H100");
    expect(gpu.count).toBe(4);
    expect(gpu.minVcpuCountPerGpu).toBe(8);
  });

  it("sends nested v2 cpu config and omits gpu and persistent mounts for CPU pods", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "cpu-worker",
      image: "img",
      computeType: "CPU",
      volumeInGb: 100,
    });

    const body = createBody();
    expect(body.gpu).toBeUndefined();
    expect(body.mounts).toBeUndefined();
    expect(body.cpu).toEqual({
      id: DEFAULT_CPU_FLAVOR_ID,
      vcpuCount: DEFAULT_CPU_VCPU_COUNT,
    });
  });
});

describe("deployWorkerPod SSH access", () => {
  it("opens no extra port and sets no key by default", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, { name: "w", image: "img" });

    const body = createBody();
    expect(body.ports).toEqual(["7777/http"]);
    expect((body.env as Record<string, string>).PUBLIC_KEY).toBeUndefined();
  });

  it("exposes 22/tcp and passes the key when one is supplied", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "w",
      image: "img",
      sshPublicKey: "ssh-ed25519 AAAAC3Nza key@host",
    });

    const body = createBody();
    expect(body.ports).toEqual(["7777/http", "22/tcp"]);
    expect((body.env as Record<string, string>).PUBLIC_KEY).toBe(
      "ssh-ed25519 AAAAC3Nza key@host"
    );
  });

  it("treats a blank key as no key", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, { name: "w", image: "img", sshPublicKey: "  " });

    const body = createBody();
    expect(body.ports).toEqual(["7777/http"]);
    expect((body.env as Record<string, string>).PUBLIC_KEY).toBeUndefined();
  });
});

describe("RunPod v2 pod actions, pagination, and direct ports", () => {
  it("uses POST /v2/pods/{id}/action for stop and start", async () => {
    mockFetch.mockResolvedValue(jsonResponse({}));

    await stopPod(API_KEY, "pod-1");
    expect(mockFetch.mock.calls[0][0]).toBe(
      "https://api.runpod.io/v2/pods/pod-1/action"
    );
    expect(JSON.parse(String(mockFetch.mock.calls[0][1].body))).toEqual({
      action: "stop",
    });

    await startPod(API_KEY, "pod-1");
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.runpod.io/v2/pods/pod-1/action"
    );
    expect(JSON.parse(String(mockFetch.mock.calls[1][1].body))).toEqual({
      action: "start",
    });
  });

  it("walks cursor pagination in listPods", async () => {
    mockFetch
      .mockResolvedValueOnce(
        jsonResponse({
          pods: [{ id: "pod-1", status: "RUNNING" }],
          pagination: { hasNextPage: true, nextCursor: "cur-2" },
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          pods: [{ id: "pod-2", status: "EXITED" }],
          pagination: { hasNextPage: false, nextCursor: null },
        })
      );

    const pods = await listPods(API_KEY);
    expect(pods.map((p) => p.id)).toEqual(["pod-1", "pod-2"]);
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.runpod.io/v2/pods");
    expect(mockFetch.mock.calls[1][0]).toBe(
      "https://api.runpod.io/v2/pods?cursor=cur-2"
    );
  });

  it("extracts direct TCP ws URL from v2 runtime.ports", () => {
    expect(
      podDirectWsUrl(
        {
          id: "pod-1",
          runtime: {
            ports: [
              { private: 7777, public: 41021, type: "tcp", ip: "45.23.12.1" },
            ],
          },
        },
        7777
      )
    ).toBe("ws://45.23.12.1:41021");

    expect(podDirectWsUrl({ id: "pod-1", runtime: null }, 7777)).toBeNull();
  });
});
