/**
 * Pins the HTTP request each Reve node sends. The fixtures were recorded from
 * the pack's own transport before the nodes moved onto the runtime provider.
 * The nodes now reach Reve through ReveProvider, with fetch stubbed at the
 * provider boundary, and must send the same endpoint, headers and body bytes.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessingContext, ReveProvider } from "@nodetool-ai/runtime";
import type { BaseNode } from "@nodetool-ai/node-sdk";
import { CreateImageNode } from "../src/nodes/create-image.js";
import { EditImageNode } from "../src/nodes/edit-image.js";
import { RemixImageNode } from "../src/nodes/remix-image.js";

const IMAGE_B64 = Buffer.from("fake-png-bytes").toString("base64");

interface WireRequest {
  url: string;
  method: string | undefined;
  headers: unknown;
  body: string;
}

const HEADERS = {
  Authorization: "Bearer test-key",
  "Content-Type": "application/json",
  Accept: "application/json"
};

const WIRE: Record<"create" | "edit" | "remix", WireRequest> = {
  create: {
    url: "https://api.reve.com/v1/image/create",
    method: "POST",
    headers: HEADERS,
    body: '{"prompt":"a red panda","aspect_ratio":"16:9","version":"latest","postprocessing":["upscale"],"test_time_scaling":3}'
  },
  edit: {
    url: "https://api.reve.com/v1/image/edit",
    method: "POST",
    headers: HEADERS,
    body: `{"edit_instruction":"make it night","reference_image":"${IMAGE_B64}","version":"latest-fast","test_time_scaling":1}`
  },
  remix: {
    url: "https://api.reve.com/v1/image/remix",
    method: "POST",
    headers: HEADERS,
    body: `{"prompt":"blend <img>0</img> and <img>1</img>","reference_images":["${IMAGE_B64}","${IMAGE_B64}"],"aspect_ratio":"1:1","version":"latest","postprocessing":["remove_background"],"test_time_scaling":1}`
  }
};

afterEach(() => {
  vi.unstubAllGlobals();
});

/** Run a node against a stubbed fetch and return the one request it sent. */
async function wireRequest(node: BaseNode): Promise<WireRequest> {
  const fetchMock = vi.fn(async () =>
    Response.json({ image: IMAGE_B64, request_id: "req-1" })
  );
  vi.stubGlobal("fetch", fetchMock);
  const context = new ProcessingContext({ jobId: "job-1" });
  context.setProviderResolver(
    () => new ReveProvider({ REVE_API_KEY: "test-key" })
  );
  await node.process(context);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as unknown as [
    string,
    RequestInit
  ];
  return {
    url,
    method: init.method,
    headers: init.headers,
    body: String(init.body)
  };
}

describe("Reve wire parity", () => {
  it("sends the recorded create request", async () => {
    const node = new CreateImageNode({
      prompt: "a red panda",
      aspect_ratio: "16:9",
      postprocessing: "upscale",
      test_time_scaling: 3
    });
    expect(await wireRequest(node)).toEqual(WIRE.create);
  });

  it("sends the recorded edit request", async () => {
    const node = new EditImageNode({
      edit_instruction: "make it night",
      image: { type: "image", data: IMAGE_B64 },
      version: "latest-fast"
    });
    expect(await wireRequest(node)).toEqual(WIRE.edit);
  });

  it("sends the recorded remix request", async () => {
    const node = new RemixImageNode({
      prompt: "blend <img>0</img> and <img>1</img>",
      reference_images: [
        { type: "image", data: IMAGE_B64 },
        { type: "image", data: IMAGE_B64 }
      ],
      aspect_ratio: "1:1",
      postprocessing: "remove_background"
    });
    expect(await wireRequest(node)).toEqual(WIRE.remix);
  });
});
