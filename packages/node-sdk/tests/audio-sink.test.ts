import { expect, it } from "vitest";
import { BaseNode } from "../src/base-node.js";
import { getNodeMetadata } from "../src/node-metadata.js";
import {
  NodeRegistry,
  hydrateGraphNodeFlags,
  createGraphNodeTypeResolver
} from "../src/registry.js";

class LiveSink extends BaseNode {
  static readonly nodeType = "test.LiveAudioSink";
  static readonly audioSink = "live" as const;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}
class RenderSink extends BaseNode {
  static readonly nodeType = "test.RenderAudioSink";
  static readonly audioSink = "render" as const;
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}
class Ordinary extends BaseNode {
  static readonly nodeType = "test.Ordinary";
  async process(): Promise<Record<string, unknown>> {
    return {};
  }
}

it("carries the class audio sink through metadata and both graph hydration paths", async () => {
  const registry = new NodeRegistry();
  for (const cls of [LiveSink, RenderSink, Ordinary]) {
    registry.register(cls);
  }
  const graph = {
    nodes: [LiveSink, RenderSink, Ordinary].map((cls, i) => ({
      id: String(i),
      type: cls.nodeType
    })),
    edges: []
  };
  expect(
    hydrateGraphNodeFlags(graph, registry).nodes.map((node) => node.audio_sink)
  ).toEqual(["live", "render", undefined]);
  const resolver = createGraphNodeTypeResolver(registry);
  for (const cls of [LiveSink, RenderSink, Ordinary]) {
    expect(getNodeMetadata(cls).audio_sink).toBe(cls.audioSink);
    expect(
      (await resolver.resolveNodeType(cls.nodeType))?.descriptorDefaults
        ?.audio_sink
    ).toBe(cls.audioSink);
  }
});

it("clears a stale saved sink flag when the registered class is ordinary", async () => {
  const registry = new NodeRegistry();
  registry.register(Ordinary);
  const resolved = await createGraphNodeTypeResolver(registry).resolveNodeType(
    Ordinary.nodeType
  );
  const hydrated = { audio_sink: "live", ...resolved?.descriptorDefaults };
  expect(hydrated.audio_sink).toBeUndefined();
});
