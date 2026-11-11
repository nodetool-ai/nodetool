import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const secrets: Record<string, string> = {};
vi.mock("@nodetool-ai/models", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@nodetool-ai/models")>()),
  getSecret: async (key: string) => secrets[key] ?? null
}));

const { handleComfyNodes, handleComfyServerStatus } = await import("../src/lib/comfy-api.js");

const OBJECT_INFO = {
  CheckpointLoaderSimple: {
    input: { required: { ckpt_name: [["juggernautXL_ragnarokBy.safetensors"]] } },
    input_order: { required: ["ckpt_name"] },
    output: ["MODEL", "CLIP", "VAE"],
    output_name: ["MODEL", "CLIP", "VAE"],
    name: "CheckpointLoaderSimple",
    display_name: "Load Checkpoint",
    category: "loaders",
    output_node: false
  }
};

describe("GET /api/comfy/nodes handler", () => {
  let server: Server;
  let url: string;

  beforeAll(async () => {
    server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(req.url === "/object_info" ? JSON.stringify(OBJECT_INFO) : "{}");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("asks for no Comfy Cloud key when the nodes come from the user's own server", async () => {
    secrets.COMFY_SERVER_URL = url;
    const res = await handleComfyNodes(new Request("http://app/api/comfy/nodes"), "u1");
    expect(res.status).toBe(200);
    const nodes = (await res.json()) as Array<{ node_type: string; required_settings: string[] }>;
    expect(nodes.map((n) => n.node_type)).toEqual(["comfy.CheckpointLoaderSimple"]);
    expect(nodes[0].required_settings).toEqual([]);
  });
});

describe("GET /api/comfy/server-status handler", () => {
  it("reports the saved server's version and checkpoints", async () => {
    const server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(
        JSON.stringify(
          req.url === "/system_stats"
            ? { system: { comfyui_version: "0.3.68" }, devices: [] }
            : req.url === "/models/checkpoints"
              ? ["sd_xl_base_1.0.safetensors"]
              : []
        )
      );
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    try {
      secrets.COMFY_SERVER_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
      const res = await handleComfyServerStatus(new Request("http://app/api/comfy/server-status"), "u1");
      expect(res.status).toBe(200);
      const status = (await res.json()) as { version: string; models: { checkpoints: string[] } };
      expect(status.version).toBe("0.3.68");
      expect(status.models.checkpoints).toEqual(["sd_xl_base_1.0.safetensors"]);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it("answers 400 when no address is saved", async () => {
    delete secrets.COMFY_SERVER_URL;
    const res = await handleComfyServerStatus(new Request("http://app/api/comfy/server-status"), "u1");
    expect(res.status).toBe(400);
  });
});
