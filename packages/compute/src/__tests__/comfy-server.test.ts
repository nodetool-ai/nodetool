import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { comfyEndpointFromWsUrl, waitForComfyServer } from "../comfy-server.js";
import { RunpodPodProvider } from "../providers/runpod.js";
import { WorkerManager, type WorkerManagerDeps } from "../manager.js";
import type { WorkerProvider } from "../providers/types.js";

const mockFetch = vi.fn();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("comfyEndpointFromWsUrl", () => {
  it("maps the WebSocket schemes to HTTP schemes", () => {
    expect(comfyEndpointFromWsUrl("wss://p-8188.proxy.runpod.net")).toBe(
      "https://p-8188.proxy.runpod.net"
    );
    expect(comfyEndpointFromWsUrl("ws://1.2.3.4:80")).toBe("http://1.2.3.4:80");
  });
});

describe("waitForComfyServer", () => {
  it("retries a proxy error until ComfyUI answers", async () => {
    mockFetch
      .mockResolvedValueOnce(new Response("bad gateway", { status: 502 }))
      .mockResolvedValueOnce(json({}));
    await waitForComfyServer("https://pod", { intervalMs: 1, timeoutMs: 1000 });
    expect(mockFetch.mock.calls[1][0]).toBe("https://pod/system_stats");
  });

  it("names the last failure on timeout", async () => {
    mockFetch.mockImplementation(async () => new Response("", { status: 502 }));
    await expect(
      waitForComfyServer("https://pod", { intervalMs: 1, timeoutMs: 10 })
    ).rejects.toThrow("HTTP 502");
  });
});

describe("RunpodPodProvider with a ComfyUI port", () => {
  it("publishes the port and adds no worker environment", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }))
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }));
    const result = await new RunpodPodProvider("key").provision({
      name: "comfy",
      image: "example/comfy:1",
      target: "runpod",
      comfyPort: 8188,
      gpu: "NVIDIA A40",
    });
    const body = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    expect(body.ports).toEqual(["8188/http"]);
    expect(body.allowedCudaVersions).toBeUndefined();
    expect(body.env).toEqual({});
    expect(result.wsUrl).toBe("wss://p1-8188.proxy.runpod.net");
  });

  it("lets a template supply the image, ports and disks", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }))
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }));
    const result = await new RunpodPodProvider("key").provision({
      name: "comfy",
      image: "runpod-template:abc",
      target: "runpod",
      comfyPort: 8188,
      templateId: "abc",
      gpu: "NVIDIA A40",
    });
    const body = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    expect(body.templateId).toBe("abc");
    for (const key of ["imageName", "ports", "containerDiskInGb", "volumeInGb", "volumeMountPath"]) {
      expect(body).not.toHaveProperty(key);
    }
    expect(result.wsUrl).toBe("wss://p1-8188.proxy.runpod.net");
  });

  it("sends an explicit disk beside a template", async () => {
    mockFetch
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }))
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }));
    await new RunpodPodProvider("key").provision({
      name: "comfy",
      image: "runpod-template:abc",
      target: "runpod",
      comfyPort: 8188,
      templateId: "abc",
      disk: 200,
    });
    const body = JSON.parse(String(mockFetch.mock.calls[0][1].body));
    expect(body.volumeInGb).toBe(200);
    expect(body).not.toHaveProperty("volumeMountPath");
  });

  it("resolves the same port on resume", async () => {
    mockFetch
      .mockResolvedValueOnce(json({}))
      .mockResolvedValueOnce(json({ id: "p1", desiredStatus: "RUNNING" }));
    const result = await new RunpodPodProvider("key").resume("p1", {
      comfyPort: 8188,
    });
    expect(result.wsUrl).toBe("wss://p1-8188.proxy.runpod.net");
  });
});

describe("WorkerManager with a ComfyUI profile", () => {
  const profile = (target: string) => ({
    name: "comfy",
    target,
    image: "example/comfy:1",
    spec: { comfyPort: 8188 },
    token_policy: "generate",
  });
  const instance = {
    id: "i1",
    profile_name: "comfy",
    target: "runpod",
    provider_ref: "p1",
    ws_url: "wss://p1-8188.proxy.runpod.net",
    token: null,
    status: "running",
  };

  function makeManager(target = "runpod") {
    const provider = {
      provision: vi.fn(async () => ({
        providerRef: "p1",
        wsUrl: instance.ws_url,
        status: "running",
      })),
      resume: vi.fn(async () => ({
        providerRef: "p1",
        wsUrl: instance.ws_url,
        status: "running",
      })),
    };
    const setSetting = vi.fn(async () => {});
    // SAFETY: each test reaches only the fields and methods defined here.
    const deps = {
      getWorkerProfile: async () => profile(target),
      createWorkerInstance: async () => instance,
      getWorkerInstance: async () => instance,
      updateWorkerInstance: async () => instance,
      getSecret: async () => "key",
      setSetting,
      providerFactory: (): Partial<WorkerProvider> => provider,
    } as Partial<WorkerManagerDeps>;
    return { manager: new WorkerManager(deps), provider, setSetting };
  }

  it("provisions with the port and without a token", async () => {
    const { manager, provider } = makeManager();
    await manager.provision("comfy");
    expect(provider.provision).toHaveBeenCalledWith(
      expect.objectContaining({ comfyPort: 8188, token: undefined })
    );
  });

  it("rejects a target with no ComfyUI support before it rents anything", async () => {
    const { manager, provider } = makeManager("vast");
    await expect(manager.provision("comfy")).rejects.toThrow("Use runpod");
    expect(provider.provision).not.toHaveBeenCalled();
  });

  it("passes the port on resume", async () => {
    const { manager, provider } = makeManager();
    await manager.resume("i1");
    expect(provider.resume).toHaveBeenCalledWith("p1", { comfyPort: 8188 });
  });

  it("refuses to attach the bridge", async () => {
    const { manager, setSetting } = makeManager();
    await expect(manager.attach("i1")).rejects.toThrow("no worker bridge");
    expect(setSetting).not.toHaveBeenCalled();
  });
});
