import { describe, expect, it, vi } from "vitest";
import type { ComfyEvent, PythonBridge } from "@nodetool-ai/runtime";
import { bridgeTransport } from "../src/nodes/comfy-worker-transport.js";
import type { ComfyRunEvent } from "../src/nodes/comfy-sdk.js";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2]);
const signal = new AbortController().signal;
const prompt = () => ({
  load: { class_type: "LoadImage", inputs: {} as Record<string, unknown> },
  save: { class_type: "SaveImage", inputs: {} as Record<string, unknown> }
});

function fakeBridge(execute: PythonBridge["comfyExecute"]): PythonBridge {
  return {
    comfyExecute: vi.fn(execute),
    cancelComfyExecute: vi.fn(),
    close: vi.fn()
  } as unknown as PythonBridge;
}

async function drain(job: { events: () => AsyncIterable<ComfyRunEvent> }) {
  const events: ComfyRunEvent[] = [];
  for await (const event of job.events()) events.push(event);
  return events;
}

describe("bridgeTransport", () => {
  it("sends inputs as blobs, maps output blobs to their node, and closes the bridge", async () => {
    const bridge = fakeBridge(async (_workflow, _options, onEvent) => {
      onEvent?.({ event: "started" } as ComfyEvent);
      onEvent?.({ event: "progress", node: "save", value: 1, max: 2 } as ComfyEvent);
      return { status: "completed", blobs: { save_image: PNG } };
    });
    const transport = bridgeTransport(bridge, 30);
    const graph = prompt();
    graph.load.inputs.image = transport.assetFromBytes(PNG, "a.png", "image/png");

    const job = await transport.submit(graph, { signal });
    const events = await drain(job);

    const [workflow, options] = vi.mocked(bridge.comfyExecute).mock.calls[0];
    expect((workflow as typeof graph).load.inputs.image).toBe("blob:load_image");
    expect(options?.blobs?.load_image).toEqual(PNG);
    expect(options?.timeout).toBe(30);
    expect(job.status).toBe("succeeded");
    expect(job.outputs[0]).toMatchObject({ nodeId: "save", type: "image", contentType: "image/png" });
    expect(events.some((e) => e.kind === "progress" && e.currentNode === "save")).toBe(true);
    expect(bridge.close).toHaveBeenCalled();
  });

  it("fails the job with the worker's error", async () => {
    const bridge = fakeBridge(async () => {
      throw new Error("out of memory");
    });
    const job = await bridgeTransport(bridge, 30).submit(prompt(), { signal });
    await drain(job);
    expect(job.status).toBe("failed");
    expect(job.error?.message).toBe("out of memory");
    expect(bridge.close).toHaveBeenCalled();
  });

  it("cancels the run on the worker", async () => {
    let reject: (err: Error) => void = () => {};
    const bridge = fakeBridge(
      () => new Promise((_resolve, rej) => {
        reject = rej;
      })
    );
    const job = await bridgeTransport(bridge, 30).submit(prompt(), { signal });
    await job.cancel();
    const requestId = vi.mocked(bridge.comfyExecute).mock.calls[0][3];
    expect(bridge.cancelComfyExecute).toHaveBeenCalledWith(requestId);
    reject(new Error("cancelled"));
    await drain(job);
    expect(job.status).toBe("canceled");
  });
});
