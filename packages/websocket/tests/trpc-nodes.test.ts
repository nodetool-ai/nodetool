/**
 * Unit tests for the tRPC nodes router.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { appRouter } from "../src/trpc/router.js";
import { createCallerFactory } from "../src/trpc/index.js";
import type { Context } from "../src/trpc/context.js";

vi.mock("@nodetool-ai/models", async (orig) => {
  const actual = await orig<typeof import("@nodetool-ai/models")>();
  return {
    ...actual,
    getSecret: vi.fn()
  };
});

import { getSecret } from "@nodetool-ai/models";

const createCaller = createCallerFactory(appRouter);

function makeCtx(overrides: Partial<Context> = {}): Context {
  return {
    userId: "user-1",
    registry: {} as never,
    apiOptions: { metadataRoots: [], registry: {} as never } as never,
    pythonBridge: {} as never,
    getPythonBridgeReady: () => false,
    ...overrides
  };
}

describe("nodes router", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("replicateStatus (public)", () => {
    it("returns configured: true when REPLICATE_API_TOKEN is set", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(
        "test-token-123"
      );
      const caller = createCaller(makeCtx({ userId: null }));
      const result = await caller.nodes.replicateStatus();
      expect(result.configured).toBe(true);
    });

    it("returns configured: false when REPLICATE_API_TOKEN is not set", async () => {
      (getSecret as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const caller = createCaller(makeCtx({ userId: null }));
      const result = await caller.nodes.replicateStatus();
      expect(result.configured).toBe(false);
    });
  });

  describe("validateUsername (protected)", () => {
    it("returns valid: true for a proper username", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john_doe"
      });
      expect(result.valid).toBe(true);
      expect(result.available).toBe(true);
    });

    it("returns valid: false for a username with spaces", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john doe"
      });
      expect(result.valid).toBe(false);
    });

    it("returns valid: true for a username with hyphens and underscores", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.validateUsername({
        username: "john-doe_123"
      });
      expect(result.valid).toBe(true);
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(
        caller.nodes.validateUsername({ username: "test" })
      ).rejects.toThrow();
    });
  });

  describe("dummy (protected)", () => {
    it("returns the expected dummy asset shape", async () => {
      const caller = createCaller(makeCtx());
      const result = await caller.nodes.dummy();
      expect(result.type).toBe("asset");
      expect(result.uri).toBe("");
      expect(result.asset_id).toBeNull();
      expect(result.data).toBeNull();
      expect(result.metadata).toBeNull();
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null }));
      await expect(caller.nodes.dummy()).rejects.toThrow();
    });
  });

  describe("list (protected)", () => {
    function makeRegistry(nodes: Array<Record<string, unknown>>) {
      return {
        listMetadata: () => nodes
      } as never;
    }

    const FOO = {
      node_type: "foo.bar.Alpha",
      title: "Alpha",
      description: "First alphabetical node",
      namespace: "foo.bar",
      properties: [],
      outputs: [],
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      required_settings: [],
      is_dynamic: false,
      is_streaming_output: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false
    };
    const BAZ = {
      ...FOO,
      node_type: "baz.Beta",
      title: "Beta",
      description: "Second node",
      namespace: "baz"
    };

    it("returns a slim summary by default", async () => {
      const caller = createCaller(
        makeCtx({ registry: makeRegistry([FOO, BAZ]) })
      );
      const result = await caller.nodes.list({ fields: "summary" });
      expect(result.nodes).toHaveLength(2);
      // Sorted alphabetically by node_type → "baz.Beta" before "foo.bar.Alpha"
      expect(result.nodes[0].node_type).toBe("baz.Beta");
      expect(result.nodes[1].node_type).toBe("foo.bar.Alpha");
      // Summary mode strips heavy fields (properties/outputs)
      expect(result.nodes[0]).not.toHaveProperty("properties");
    });

    it("returns full metadata when fields=full", async () => {
      const caller = createCaller(
        makeCtx({ registry: makeRegistry([FOO]) })
      );
      const result = await caller.nodes.list({ fields: "full" });
      expect(result.nodes[0]).toMatchObject({
        node_type: "foo.bar.Alpha",
        properties: [],
        outputs: []
      });
    });

    it("filters by namespace prefix", async () => {
      const caller = createCaller(
        makeCtx({ registry: makeRegistry([FOO, BAZ]) })
      );
      const result = await caller.nodes.list({
        namespace: "foo.",
        fields: "summary"
      });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].node_type).toBe("foo.bar.Alpha");
    });

    it("scores and orders by query terms", async () => {
      const caller = createCaller(
        makeCtx({ registry: makeRegistry([FOO, BAZ]) })
      );
      const result = await caller.nodes.list({
        query: "alphabetical",
        fields: "summary"
      });
      expect(result.nodes).toHaveLength(1);
      expect(result.nodes[0].node_type).toBe("foo.bar.Alpha");
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(
        makeCtx({ userId: null, registry: makeRegistry([]) })
      );
      await expect(caller.nodes.list({ fields: "summary" })).rejects.toThrow();
    });
  });

  describe("get (protected)", () => {
    const NODE = {
      node_type: "foo.Bar",
      title: "Bar",
      description: "A node",
      namespace: "foo",
      properties: [],
      outputs: [],
      layout: "default",
      recommended_models: [],
      basic_fields: [],
      required_settings: [],
      is_dynamic: false,
      is_streaming_output: false,
      expose_as_tool: false,
      supports_dynamic_outputs: false
    };
    const registry = { listMetadata: () => [NODE] } as never;

    it("returns full metadata for a known node_type", async () => {
      const caller = createCaller(makeCtx({ registry }));
      const result = await caller.nodes.get({ node_type: "foo.Bar" });
      expect(result.node_type).toBe("foo.Bar");
      expect(result.title).toBe("Bar");
    });

    it("throws NOT_FOUND for an unknown node_type", async () => {
      const caller = createCaller(makeCtx({ registry }));
      await expect(
        caller.nodes.get({ node_type: "does.not.Exist" })
      ).rejects.toThrow(/Node type not found/);
    });

    it("throws UNAUTHORIZED for unauthenticated requests", async () => {
      const caller = createCaller(makeCtx({ userId: null, registry }));
      await expect(
        caller.nodes.get({ node_type: "foo.Bar" })
      ).rejects.toThrow();
    });
  });
});
