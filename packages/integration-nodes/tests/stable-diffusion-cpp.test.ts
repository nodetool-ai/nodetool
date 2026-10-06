import { afterEach, describe, expect, it, vi } from "vitest";
import { getNodeMetadata } from "@nodetool-ai/node-sdk";
import { isCloudNodeType } from "@nodetool-ai/protocol";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  StableDiffusionCppGenerateNode,
  STABLE_DIFFUSION_CPP_NODES
} from "../src/nodes/stable-diffusion-cpp.js";

const PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=";
const completed = {
  status: "completed",
  result: {
    output_format: "png",
    images: [{ b64_json: PNG }, { b64_json: PNG }]
  }
};

function transport(responses: unknown[]) {
  const fetchMock = vi.fn(async (_url: URL, _options: RequestInit) =>
    Response.json(responses.shift())
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

describe("stable-diffusion.cpp generation", () => {
  it("declares server registration and connectable image outputs", () => {
    expect(STABLE_DIFFUSION_CPP_NODES).toContain(
      StableDiffusionCppGenerateNode
    );
    expect(getNodeMetadata(StableDiffusionCppGenerateNode).node_type).toBe(
      "lib.stable_diffusion_cpp.GenerateImage"
    );
    expect(StableDiffusionCppGenerateNode.autoSaveAsset).toBe(true);
    expect(isCloudNodeType(StableDiffusionCppGenerateNode.nodeType)).toBe(
      false
    );
  });

  it("submits native controls and returns every batch image on declared ports", async () => {
    const fetchMock = transport([
      { id: "job/test", poll_url: "http://other-host/steal" },
      completed
    ]);
    const node = new StableDiffusionCppGenerateNode({
      prompt: "a cat",
      seed: 0,
      count: 2,
      sampler: "euler",
      scheduler: "discrete",
      cfg_scale: 0
    });
    const result = await node.process();
    expect(result).toEqual({
      output: { type: "image", uri: "", data: PNG, mimeType: "image/png" },
      images: [result.output, result.output]
    });
    expect(Object.keys(result).sort()).toEqual(
      Object.keys(StableDiffusionCppGenerateNode.metadataOutputTypes).sort()
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://127.0.0.1:1234/sdcpp/v1/img_gen"
    );
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe(
      "http://127.0.0.1:1234/sdcpp/v1/jobs/job%2Ftest"
    );
    const options = fetchMock.mock.calls[0]?.[1];
    expect(options).toMatchObject({ method: "POST", redirect: "error" });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      seed: 0,
      batch_count: 2,
      sample_params: {
        sample_steps: 20,
        sample_method: "euler",
        scheduler: "discrete",
        guidance: { txt_cfg: 0 }
      }
    });
  });

  it("resolves media through the context, with connected media overriding advanced fields", async () => {
    const fetchMock = transport([{ id: "job" }, completed]);
    const load = vi.fn(async () => ({ bytes: new Uint8Array([1, 2, 3]) }));
    // The node only needs the context's owned-asset resolver in this test.
    const context = { resolveAssetBytes: load } as unknown as ProcessingContext;
    const media = {
      type: "image",
      uri: "asset://0123456789abcdef0123456789abcdef"
    };
    await new StableDiffusionCppGenerateNode({
      prompt: "edit",
      image: media,
      mask: media,
      reference_images: [media],
      parameters: {
        init_image: "wrong",
        lora: [{ path: "style.safetensors", multiplier: 0.5 }],
        sample_params: { sample_steps: 4 }
      }
    }).process(context);
    expect(load).toHaveBeenCalledTimes(3);
    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(body).toMatchObject({
      init_image: "AQID",
      mask_image: "AQID",
      ref_images: ["AQID"],
      sample_params: { sample_steps: 4 },
      lora: [{ path: "style.safetensors", multiplier: 0.5 }]
    });
  });

  it.each(["failed", "cancelled"])(
    "surfaces %s jobs without resubmitting",
    async (status) => {
      const fetchMock = transport([
        { id: "job" },
        { status, error: { message: "generation stopped" } }
      ]);
      await expect(
        new StableDiffusionCppGenerateNode({ prompt: "cat" }).process()
      ).rejects.toThrow("generation stopped");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  );

  it("polls queued and generating jobs until completion", async () => {
    const fetchMock = transport([
      { id: "job" },
      { status: "queued" },
      { status: "generating" },
      completed
    ]);
    await new StableDiffusionCppGenerateNode({ prompt: "cat" }).process();
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it("cancels its own job when the workflow is aborted", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
      if (fetchMock.mock.calls.length === 1)
        return Response.json({ id: "job" });
      if (fetchMock.mock.calls.length === 2) {
        controller.abort();
        options.signal?.throwIfAborted();
      }
      return Response.json({ status: "cancelled" });
    });
    vi.stubGlobal("fetch", fetchMock);
    // Cancellation requires only the run signal, not a complete runtime context.
    const context = {
      signal: controller.signal
    } as unknown as ProcessingContext;
    await expect(
      new StableDiffusionCppGenerateNode({ prompt: "cat" }).process(context)
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(String(fetchMock.mock.calls[2]?.[0])).toBe(
      "http://127.0.0.1:1234/sdcpp/v1/jobs/job/cancel"
    );
    expect(fetchMock.mock.calls[2]?.[1].signal?.aborted).toBe(false);
  });

  it("does not retry job submission on an HTTP error", async () => {
    const fetchMock = vi.fn(
      async () => new Response("queue full", { status: 429 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new StableDiffusionCppGenerateNode({ prompt: "cat" }).process()
    ).rejects.toThrow("HTTP 429: queue full");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports the server's refusal to interrupt active generation", async () => {
    const controller = new AbortController();
    const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
      if (fetchMock.mock.calls.length === 1) {
        return Response.json({ id: "job" });
      }
      if (fetchMock.mock.calls.length === 2) {
        controller.abort();
        options.signal?.throwIfAborted();
      }
      return new Response(
        "job is currently generating and cannot be interrupted yet",
        { status: 409 }
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    // Only the run signal is needed to exercise cancellation refusal.
    const context = {
      signal: controller.signal
    } as unknown as ProcessingContext;
    await expect(
      new StableDiffusionCppGenerateNode({ prompt: "cat" }).process(context)
    ).rejects.toMatchObject({
      name: "AggregateError",
      message:
        "stable-diffusion.cpp generation stopped but job cancellation failed",
      errors: [
        expect.objectContaining({ name: "AbortError" }),
        expect.objectContaining({
          message: expect.stringContaining("HTTP 409")
        })
      ]
    });
  });

  it("cancels a queued job on timeout", async () => {
    const fetchMock = vi.fn(async (_url: URL, options: RequestInit) => {
      if (options.method === "POST") {
        return Response.json(
          fetchMock.mock.calls.length === 1
            ? { id: "job" }
            : { status: "cancelled" }
        );
      }
      return Response.json({ status: "queued" });
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      new StableDiffusionCppGenerateNode({
        prompt: "cat",
        timeout: 1
      }).process()
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(String(fetchMock.mock.lastCall?.[0])).toBe(
      "http://127.0.0.1:1234/sdcpp/v1/jobs/job/cancel"
    );
  });

  it("rejects unresolved media before submitting a job", async () => {
    const fetchMock = transport([]);
    await expect(
      new StableDiffusionCppGenerateNode({
        prompt: "cat",
        image: { type: "image", data: "" }
      }).process()
    ).rejects.toThrow("Could not load");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { status: "unknown" },
    { status: "completed", result: { output_format: "png", images: [] } }
  ])("rejects malformed job responses", async (job) => {
    transport([{ id: "job" }, job]);
    await expect(
      new StableDiffusionCppGenerateNode({ prompt: "cat" }).process()
    ).rejects.toThrow();
  });

  it.each([
    { prompt: " " },
    { prompt: "cat", timeout: 0 },
    { prompt: "cat", width: -1 },
    { prompt: "cat", endpoint: "file:///tmp" }
  ])("rejects invalid controls before submitting", async (props) => {
    const fetchMock = transport([]);
    await expect(
      new StableDiffusionCppGenerateNode(props).process()
    ).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
