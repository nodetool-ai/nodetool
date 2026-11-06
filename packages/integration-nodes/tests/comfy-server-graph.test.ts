/**
 * A Comfy workflow on a self-hosted ComfyUI. The server here speaks the native
 * HTTP and WebSocket protocol, so the runner, transport and executor are real.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocketServer, type WebSocket } from "ws";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  ComfyCloudGraphNode,
  clearComfyObjectInfoCache,
  normalizeComfyServerUrl
} from "../src/index.js";

const OBJECT_INFO = {
  LoadImage: {
    input: { required: { image: [["x.png"]] } },
    output: ["IMAGE"],
    output_name: ["IMAGE"]
  },
  SaveImage: {
    input: { required: { images: ["IMAGE"], filename_prefix: ["STRING"] } },
    output: [],
    output_node: true
  }
};
const PNG = Buffer.from("fake-png-bytes");

interface Fake {
  url: string;
  prompts: Array<Record<string, { class_type: string; inputs: Record<string, unknown> }>>;
  uploads: string[];
  fail: string | null;
  requests: string[];
}

let server: Server;
let wss: WebSocketServer;
let fake: Fake;

beforeEach(async () => {
  clearComfyObjectInfoCache();
  const sockets = new Set<WebSocket>();
  const send = (type: string, data: Record<string, unknown>): void => {
    for (const socket of sockets) socket.send(JSON.stringify({ type, data }));
  };
  fake = { url: "", prompts: [], uploads: [], fail: null, requests: [] };
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const path = (req.url ?? "").split("?")[0];
      fake.requests.push(path);
      const body = Buffer.concat(chunks);
      res.setHeader("content-type", "application/json");
      if (path === "/object_info") {
        res.end(JSON.stringify(OBJECT_INFO));
      } else if (path === "/upload/image") {
        const name = /filename="([^"]+)"/.exec(body.toString("latin1"))?.[1] ?? "?";
        fake.uploads.push(name);
        res.end(JSON.stringify({ name }));
      } else if (path === "/prompt") {
        fake.prompts.push(JSON.parse(body.toString()).prompt);
        const prompt_id = "p1";
        res.end(JSON.stringify({ prompt_id }));
        setTimeout(() => {
          send("execution_start", { prompt_id });
          send("executing", { prompt_id, node: "save" });
          send("progress", { prompt_id, value: 1, max: 2 });
          if (fake.fail) {
            send("execution_error", { prompt_id, node_id: "save", exception_message: fake.fail });
            return;
          }
          send("executed", {
            prompt_id,
            node: "save",
            output: { images: [{ filename: "out.png", subfolder: "", type: "output" }] }
          });
          send("execution_success", { prompt_id });
        }, 10);
      } else if (path === "/view") {
        res.setHeader("content-type", "image/png");
        res.end(PNG);
      } else {
        res.end("{}");
      }
    });
  });
  wss = new WebSocketServer({ server, path: "/ws" });
  wss.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  fake.url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const client of wss.clients) client.terminate();
  await new Promise((resolve) => wss.close(resolve));
  await new Promise((resolve) => server.close(resolve));
});

function run(secrets: Record<string, string>) {
  const node = new ComfyCloudGraphNode();
  const internals = node as unknown as {
    assign: (p: Record<string, unknown>) => void;
    setDynamic: (k: string, v: unknown) => void;
  };
  internals.assign({
    nodes: [
      { id: "load", type: "comfy.LoadImage", properties: { image: "x.png" } },
      { id: "save", type: "comfy.SaveImage", properties: { filename_prefix: "t", images: null } }
    ],
    edges: [{ source: "load", sourceHandle: "IMAGE", target: "save", targetHandle: "images" }],
    output_slots: ["save:output"],
    timeout: 10
  });
  internals.setDynamic("load:image", { type: "image", data: Buffer.from("in").toString("base64") });
  const messages: Array<Record<string, unknown>> = [];
  const context = {
    postMessage: (m: Record<string, unknown>) => messages.push(m),
    normalizeOutputValue: async (v: unknown) => v,
    getSecret: async (key: string) => secrets[key] ?? null
  } as unknown as ProcessingContext;
  return { node, context, messages };
}

describe("Comfy workflow on a self-hosted ComfyUI", () => {
  it("uploads the input, runs the graph, and returns the saved file with no API key", async () => {
    const { node, context, messages } = run({ COMFY_SERVER_URL: fake.url });
    const result = await node.process(context);

    expect(fake.uploads).toEqual(["nodetool_load_image.png"]);
    expect(fake.prompts[0].load.inputs.image).toBe("nodetool_load_image.png");
    expect(fake.prompts[0].save.inputs.images).toEqual(["load", 0]);
    const saved = result["save:output"] as { type: string; data: string };
    expect(saved.type).toBe("image");
    expect(Buffer.from(saved.data, "base64")).toEqual(PNG);
    expect((result.output as { status: string }).status).toBe("succeeded");
    expect(messages).toContainEqual(
      expect.objectContaining({ type: "node_progress", node_id: "save", progress: 1, total: 2 })
    );
  });

  it("prefers the server over a stored Comfy Cloud key", async () => {
    const { node, context } = run({ COMFY_SERVER_URL: fake.url, COMFY_API_KEY: "ck" });
    await node.process(context);
    expect(fake.prompts).toHaveLength(1);
  });

  it("runs on Comfy Cloud when the target says cloud, even with a server URL", async () => {
    const { node, context } = run({
      COMFY_TARGET: "cloud",
      COMFY_SERVER_URL: fake.url
    });
    await expect(node.process(context)).rejects.toThrow("COMFY_API_KEY");
    expect(fake.requests).toEqual([]);
  });

  it("does not fall back to Comfy Cloud when the selected server is not set", async () => {
    const { node, context } = run({ COMFY_TARGET: "server", COMFY_API_KEY: "ck" });
    await expect(node.process(context)).rejects.toThrow("COMFY_SERVER_URL is not set");
  });

  it("does not fall back when the selected worker is not set", async () => {
    const { node, context } = run({
      COMFY_TARGET: "worker",
      COMFY_SERVER_URL: fake.url,
      COMFY_API_KEY: "ck"
    });
    await expect(node.process(context)).rejects.toThrow("COMFY_WORKER_URL is not set");
    expect(fake.requests).toEqual([]);
  });

  it("rejects an unknown target", async () => {
    const { node, context } = run({ COMFY_TARGET: "mars", COMFY_API_KEY: "ck" });
    await expect(node.process(context)).rejects.toThrow('COMFY_TARGET is "mars"');
  });

  it("reports the error ComfyUI raised", async () => {
    fake.fail = "CUDA out of memory";
    const { node, context } = run({ COMFY_SERVER_URL: fake.url });
    await expect(node.process(context)).rejects.toThrow("CUDA out of memory");
  });

  it("names the setting when the server cannot be reached", async () => {
    const { node, context } = run({ COMFY_SERVER_URL: "http://127.0.0.1:9" });
    await expect(node.process(context)).rejects.toThrow("COMFY_SERVER_URL");
  });

  it("asks for a place to run when neither setting exists", async () => {
    const { node, context } = run({});
    await expect(node.process(context)).rejects.toThrow("COMFY_SERVER_URL");
  });

  it("accepts a bare host and port", () => {
    expect(normalizeComfyServerUrl(" 127.0.0.1:8188/ ")).toBe("http://127.0.0.1:8188");
    expect(normalizeComfyServerUrl("https://gpu.example")).toBe("https://gpu.example");
  });
});
