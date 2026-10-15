import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { createTestUiServer } from "../src/test-ui-server.js";

describe("test UI server registry", () => {
  it("uses the supplied registry without adding unrelated built-in metadata", async () => {
    const registry = new NodeRegistry();
    const server = await createTestUiServer({
      host: "127.0.0.1",
      port: 0,
      registry,
      configureRegistry: (configured) => expect(configured).toBe(registry)
    });
    await server.listen();
    try {
      const address = server.server.address();
      if (!address || typeof address === "string") {
        throw new Error("Missing server address");
      }
      const response = await fetch(`http://127.0.0.1:${address.port}/api/nodes/metadata`);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual([]);
      expect(server.info.metadataCount).toBe(0);
      expect(registry.list()).toEqual([]);
    } finally {
      await server.close();
    }
  });

  it("registers built-in nodes when no registry is supplied", async () => {
    const server = await createTestUiServer({
      host: "127.0.0.1",
      port: 0,
      configureRegistry: (registry) => expect(registry.has("nodetool.constant.String")).toBe(true)
    });
    await server.listen();
    try {
      expect(server.info.metadataCount).toBeGreaterThan(0);
    } finally {
      await server.close();
    }
  });
});
