import { afterEach, describe, expect, it, vi } from "vitest";
import {
  availabilityRank,
  fetchRunpodGpuAvailability,
} from "../providers/runpod-availability.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(body: unknown, status = 200) {
  const fetchMock = vi.fn(async () =>
    new Response(JSON.stringify(body), { status })
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("fetchRunpodGpuAvailability", () => {
  it("reads both cloud tiers with the CUDA minimum", async () => {
    const fetchMock = stubFetch({
      data: {
        gpuTypes: [
          {
            id: "NVIDIA L40S",
            displayName: "L40S",
            secure: { stockStatus: "Low" },
            community: { stockStatus: null },
          },
          { id: "NVIDIA A40", displayName: "A40", secure: null, community: null },
        ],
      },
    });
    const result = await fetchRunpodGpuAvailability("key");
    expect(result).toEqual([
      { id: "NVIDIA L40S", displayName: "L40S", secure: "Low", community: null },
      { id: "NVIDIA A40", displayName: "A40", secure: null, community: null },
    ]);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const query = JSON.parse(String(init.body)).query as string;
    expect(query).toContain('secureCloud:true, minCudaVersion:"13.0"');
    expect(query).toContain('secureCloud:false, minCudaVersion:"13.0"');
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key");
  });

  it("throws on GraphQL errors", async () => {
    stubFetch({ errors: [{ message: "unauthorized" }] });
    await expect(fetchRunpodGpuAvailability("key")).rejects.toThrow("unauthorized");
  });

  it("throws on an HTTP failure", async () => {
    stubFetch({}, 500);
    await expect(fetchRunpodGpuAvailability("key")).rejects.toThrow("(500)");
  });

  it("rejects a CUDA version that is not a number", async () => {
    await expect(
      fetchRunpodGpuAvailability("key", { minCudaVersion: '1") {x' })
    ).rejects.toThrow("Invalid minCudaVersion");
  });
});

describe("availabilityRank", () => {
  it("uses the better tier and ranks missing stock as zero", () => {
    expect(availabilityRank(undefined)).toBe(0);
    expect(availabilityRank({ secure: null, community: null })).toBe(0);
    expect(availabilityRank({ secure: "Low", community: "High" })).toBe(3);
  });
});
