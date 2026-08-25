/**
 * Native flow in a CodeAct session: the allowlist wiring and the prompt
 * section that points at the pack. The capability calls themselves are
 * covered by `capabilities-flow.test.ts`; this pins that a session which can
 * use the pack is told about it, and one that cannot is not.
 */
import { describe, it, expect } from "vitest";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import {
  FLOW_PACKAGE,
  catalogServesFlow,
  withFlowPackage
} from "../src/codeact/flow-package.js";
import { buildNodetoolApiPromptSection } from "../src/codeact/nodetool-api.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";
import type { ChatCodeActToolCall } from "../src/codeact/chat-codeact.js";
import { shippedPackCatalog } from "../src/evals/codeact-sandbox-pack-cases.js";

const emptyCatalog: SandboxModuleCatalog = {
  summaries: () => [],
  diagnostics: () => [],
  resolveForExecution: () => ({ modules: [], statuses: [] }),
  authorizeDelivery: () =>
    Promise.resolve({
      authorized: false as const,
      reason: "not-found" as const,
      message: "no"
    })
};

describe("flow package session wiring", () => {
  it("allows the pack when the catalog serves it", () => {
    expect(catalogServesFlow(shippedPackCatalog())).toBe(true);
    expect(withFlowPackage([], shippedPackCatalog())).toEqual([FLOW_PACKAGE]);
  });

  it("never advertises a pack this machine has not installed", () => {
    expect(catalogServesFlow(emptyCatalog)).toBe(false);
    expect(withFlowPackage([], emptyCatalog)).toEqual([]);
    expect(withFlowPackage([], null)).toEqual([]);
  });

  it("adds it once when the caller already consented to it", () => {
    expect(withFlowPackage([FLOW_PACKAGE], shippedPackCatalog())).toEqual([
      FLOW_PACKAGE
    ]);
  });
});

describe("a chat session with the flow pack", () => {
  const executeTool = async (call: ChatCodeActToolCall): Promise<unknown> =>
    JSON.stringify({ ok: true, tool: call.name });

  it("advertises the pack, the section, and the required bridge import", () => {
    const prompt = createChatCodeActSession({
      tools: [
        {
          name: "search_nodes",
          description: "Tool search_nodes.",
          inputSchema: { type: "object", properties: {} }
        }
      ],
      executeTool,
      sandboxModuleCatalog: shippedPackCatalog()
    }).systemPromptSection;
    expect(prompt).toContain(FLOW_PACKAGE);
    expect(prompt).toContain("Calling nodes directly");
    expect(prompt).toContain("@nodetool-ai/sandbox-nodetool/flow");
  });

  it("says nothing about the pack when it is not installed", () => {
    const prompt = createChatCodeActSession({
      tools: [
        {
          name: "search_nodes",
          description: "Tool search_nodes.",
          inputSchema: { type: "object", properties: {} }
        }
      ],
      executeTool,
      sandboxModuleCatalog: emptyCatalog
    }).systemPromptSection;
    expect(prompt).not.toContain(FLOW_PACKAGE);
  });
});

describe("choosing between the surfaces", () => {
  const BELT = [
    "create_workflow",
    "validate_workflow",
    "run_workflow",
    "find_model",
    "generate_image",
    "search_nodes"
  ];

  it("routes a do-the-work ask to flow and a save-it ask to the graph", () => {
    // A turn asked to "run a pipeline: generate an image, then remove its
    // background" authored a graph, saved it, and never ran it.
    const section = buildNodetoolApiPromptSection(BELT, {
      graphDsl: true,
      nativeFlow: true
    });
    expect(section).toContain("# Which surface runs the work");
    expect(section).toContain("the user wants the RESULT");
    expect(section).toContain("the user wants the WORKFLOW");
    expect(section).toContain("Authoring it does not run it");
    // The section decides before either pack's own instructions are read.
    expect(section.indexOf("# Which surface runs the work")).toBeLessThan(
      section.indexOf("# Calling nodes directly")
    );
  });

  it("says a media verb is not a stand-in for a node", () => {
    // Asked to do it "without a graph", the same turn called
    // `media.editImage(img, "remove the background")` rather than the
    // RemoveBackground node it had already found with search_nodes.
    const section = buildNodetoolApiPromptSection(BELT, {
      graphDsl: true,
      nativeFlow: true
    });
    expect(section).toContain("`nodetool.media.*` — ONE generation");
    expect(section).toContain("background remover");
  });

  it("names no surface this session lacks", () => {
    const flowOnly = buildNodetoolApiPromptSection(["search_nodes"], {
      nativeFlow: true
    });
    expect(flowOnly).toContain("# Which surface runs the work");
    expect(flowOnly).not.toContain("Graph DSL");
    expect(flowOnly).not.toContain("nodetool.media.*` — ONE generation");

    const neither = buildNodetoolApiPromptSection(BELT);
    expect(neither).not.toContain("# Which surface runs the work");
  });
});

describe("what the flow section teaches", () => {
  const section = buildNodetoolApiPromptSection(["search_nodes"], {
    nativeFlow: true
  });

  it("maps a node type to its export name", () => {
    expect(section).toContain("`nodetool.image.RemoveBackground` is");
    expect(section).toContain("removeBackground");
  });

  it("tells the caller to pick a model instead of taking the default", () => {
    // A graph run failed validation twice on unset `image_model` properties;
    // a flow call takes the node's default silently instead.
    expect(section).toContain("`*_model` input");
    expect(section).toContain("nodetool.models.pick(task)).ref");
  });

  it("keeps media refs out of the observation", () => {
    expect(section).toContain("Never return inline bytes as the observation");
  });
});
