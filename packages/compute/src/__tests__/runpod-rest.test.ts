import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_CPU_VCPU_COUNT,
  DEFAULT_GPU_COUNT,
  DEFAULT_GPU_VCPU_COUNT,
  deployWorkerPod,
} from "../providers/runpod-rest.js";

// ---------------------------------------------------------------------------
// Mock the global fetch the RunPod REST transport uses.
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

/** First fetch is the POST /pods create; subsequent are the RUNNING poll. */
function mockCreateThenRunning() {
  mockFetch
    .mockResolvedValueOnce(jsonResponse({ id: "pod-1" }))
    .mockResolvedValue(
      jsonResponse({ id: "pod-1", desiredStatus: "RUNNING" })
    );
}

/** Parse the JSON body sent to the create-pod POST. */
function createBody(): Record<string, unknown> {
  const call = mockFetch.mock.calls[0];
  return JSON.parse((call[1] as RequestInit).body as string);
}

describe("deployWorkerPod GPU spec", () => {
  it("sets explicit gpuCount and vcpuCount for GPU pods", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeIds: ["NVIDIA GeForce RTX 4090"],
    });

    const body = createBody();
    expect(body.computeType).toBe("GPU");
    expect(body.gpuCount).toBe(DEFAULT_GPU_COUNT);
    expect(body.vcpuCount).toBe(DEFAULT_GPU_VCPU_COUNT);
  });

  it("honors explicit gpuCount / vcpuCount overrides", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "gpu-worker",
      image: "img",
      computeType: "GPU",
      gpuTypeIds: ["NVIDIA H100"],
      gpuCount: 4,
      vcpuCount: 32,
    });

    const body = createBody();
    expect(body.gpuCount).toBe(4);
    expect(body.vcpuCount).toBe(32);
  });

  it("does not set gpuCount for CPU pods and pins vcpuCount", async () => {
    mockCreateThenRunning();

    await deployWorkerPod(API_KEY, {
      name: "cpu-worker",
      image: "img",
      computeType: "CPU",
    });

    const body = createBody();
    expect(body.gpuCount).toBeUndefined();
    expect(body.vcpuCount).toBe(DEFAULT_CPU_VCPU_COUNT);
  });
});
