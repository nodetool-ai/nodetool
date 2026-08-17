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
