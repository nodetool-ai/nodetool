import { describe, it, expect } from "vitest";
import {
  GENERIC_AI_NODES,
  buildGraphPlannerSystemPrompt,
  resolveAvailableGenericNodes,
  type GenericNodeCapability
} from "../src/prompts/graph-planner-prompt.js";
import type { NodeMetadata } from "@nodetool-ai/node-sdk";

const VALID_CAPABILITIES: GenericNodeCapability[] = [
  "text_to_image",
  "image_to_image",
  "text_to_video",
  "image_to_video",
  "text_to_speech",
  "automatic_speech_recognition",
  "generate_embedding",
  "generate_message"
];

function stubMeta(node_type: string): NodeMetadata {
  return {
    title: node_type,
    description: "",
    namespace: node_type.split(".").slice(0, -1).join("."),
    node_type,
    properties: [],
    outputs: []
  };
}

/** Registry that only knows the given node types via getMetadata. */
function lookupOf(known: string[]) {
  const set = new Set(known);
  return {
    getMetadata: (t: string): NodeMetadata | undefined =>
      set.has(t) ? stubMeta(t) : undefined
  };
}

describe("GENERIC_AI_NODES catalog", () => {
  it("has unique node types", () => {
    const types = GENERIC_AI_NODES.map((n) => n.type);
    expect(new Set(types).size).toBe(types.length);
  });

  it("uses only known capabilities", () => {
    for (const node of GENERIC_AI_NODES) {
      expect(VALID_CAPABILITIES).toContain(node.capability);
    }
  });

  it("only AgentStep declines a model property", () => {
    for (const node of GENERIC_AI_NODES) {
      if (node.type === "nodetool.agents.AgentStep") {
        expect(node.acceptsModel).toBe(false);
      } else {
        expect(node.acceptsModel).toBe(true);
      }
    }
  });
});

describe("resolveAvailableGenericNodes", () => {
  it("returns the full catalog when the registry can't be introspected", () => {
    const { available, missing } = resolveAvailableGenericNodes(
      {} as Record<string, never>
    );
    expect(available).toEqual([...GENERIC_AI_NODES]);
    expect(missing).toEqual([]);
  });

  it("returns the full catalog when the registry knows none of them", () => {
    const { available, missing } = resolveAvailableGenericNodes(lookupOf([]));
    expect(available).toEqual([...GENERIC_AI_NODES]);
    expect(missing).toEqual([]);
  });

  it("drops nodes the registry lacks and reports them as missing", () => {
    const present = GENERIC_AI_NODES.slice(0, 2).map((n) => n.type);
    const { available, missing } = resolveAvailableGenericNodes(
      lookupOf(present)
    );
    expect(available.map((n) => n.type)).toEqual(present);
    expect(missing).toEqual(
      GENERIC_AI_NODES.slice(2).map((n) => n.type)
    );
  });

  it("returns no missing when the registry has every catalog node", () => {
    const all = GENERIC_AI_NODES.map((n) => n.type);
    const { available, missing } = resolveAvailableGenericNodes(lookupOf(all));
    expect(available.map((n) => n.type)).toEqual(all);
    expect(missing).toEqual([]);
  });
});

describe("buildGraphPlannerSystemPrompt", () => {
  it("advertises every catalog node by default", () => {
    const prompt = buildGraphPlannerSystemPrompt();
    for (const node of GENERIC_AI_NODES) {
      expect(prompt).toContain(node.type);
    }
  });

  it("renders only the generic nodes it is given", () => {
    const subset = GENERIC_AI_NODES.slice(0, 2);
    const prompt = buildGraphPlannerSystemPrompt({ genericNodes: subset });
    for (const node of subset) {
      expect(prompt).toContain(`| ${node.task} | \`${node.type}\``);
    }
    for (const node of GENERIC_AI_NODES.slice(2)) {
      expect(prompt).not.toContain(`| ${node.task} | \`${node.type}\``);
    }
  });
});
