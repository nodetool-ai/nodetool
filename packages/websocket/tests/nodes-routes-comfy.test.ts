import { afterEach, beforeEach, describe, expect, it } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import nodesRoutes from "../src/routes/nodes.js";

const workflow = {
  "4": {
    class_type: "CLIPTextEncode",
    inputs: { text: "photo of a woman", clip: ["2", 0] }
  },
  "13": {
    class_type: "EmptyFlux2LatentImage",
    inputs: { width: 256, height: 256, batch_size: 1 }
  },
  "15": {
    class_type: "SaveImage",
    inputs: { images: ["14", 0], filename_prefix: "nodetool-bridge/quality" }
  }
};

describe("Comfy workflow resolve route", () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = Fastify({ logger: false });
    await app.register(nodesRoutes, { apiOptions: {} });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("derives slots from workflow JSON text", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: { workflow: JSON.stringify(workflow) }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.prompt).toEqual(workflow);
    expect(body.dynamic_outputs).toEqual({
      "15:image": { type: "image", type_args: [], optional: false }
    });
    expect(Object.keys(body.dynamic_inputs)).toEqual(["4:text"]);
    expect(body.dynamic_properties).toEqual({ "4:text": "photo of a woman" });
    expect(
      body.available_params.map((p: { handle: string }) => p.handle)
    ).toEqual([
      "13:width",
      "13:height",
      "13:batch_size",
      "15:filename_prefix"
    ]);
  });

  it("accepts the workflow as an object", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: { workflow }
    });
    expect(res.statusCode).toBe(200);
    expect(Object.keys(res.json().dynamic_outputs)).toEqual(["15:image"]);
  });

  it("explains a UI-format workflow with a 400", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: { workflow: { nodes: [], links: [] } }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/Save \(API Format\)/);
  });

  it("rejects a body with neither workflow nor png_base64", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: {}
    });
    expect(res.statusCode).toBe(400);
  });

  it("explains bytes that are not a PNG", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/comfy/resolve-workflow",
      payload: { png_base64: Buffer.from("not a png").toString("base64") }
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().detail).toMatch(/Not a PNG/);
  });
});
