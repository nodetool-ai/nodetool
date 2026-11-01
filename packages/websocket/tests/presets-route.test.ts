import Fastify from "fastify";
import { expect, it, vi } from "vitest";
import presetRoutes from "../src/routes/presets.js";

vi.mock("@nodetool-ai/pack-core/preset-catalog", () => ({
  runtimePresetCatalog: () => ({
    presets: [{ id: "camera.community", author: "Community author" }],
    studios: []
  })
}));

it("serves runtime presets through the API and inherits the host auth hook", async () => {
  const app = Fastify();
  app.addHook("onRequest", async (request, reply) => {
    if (request.headers.authorization !== "Bearer fixture") {
      return reply.status(401).send({ error: "Unauthorized" });
    }
  });
  await app.register(presetRoutes);
  try {
    expect((await app.inject({ url: "/api/presets" })).statusCode).toBe(401);
    const response = await app.inject({ url: "/api/presets", headers: { authorization: "Bearer fixture" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([{ id: "camera.community", author: "Community author" }]);
  } finally {
    await app.close();
  }
});
