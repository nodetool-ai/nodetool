/**
 * Fabric as the SVG surface: allowlist wiring, and a chat session that
 * advertises the pack when the catalog serves it.
 */
import { describe, it, expect } from "vitest";
import type { SandboxModuleCatalog } from "@nodetool-ai/runtime";

import {
  FABRIC_PACKAGE,
  FABRIC_PROMPT_SECTION,
  catalogServesFabric,
  withFabricPackage
} from "../src/codeact/fabric-package.js";
import { createChatCodeActSession } from "../src/codeact/chat-codeact.js";

const fabricCatalog: SandboxModuleCatalog = {
  summaries: () => [
    {
      specifier: FABRIC_PACKAGE,
      packName: FABRIC_PACKAGE,
      kind: "host",
      description:
        "Build, parse, and rasterize SVG with Fabric.js (renderSVG, loadSVG, render)."
    }
  ],
  diagnostics: () => [],
  resolveForExecution: () => ({ modules: [], statuses: [] }),
  authorizeDelivery: () =>
    Promise.resolve({
      authorized: false as const,
      reason: "not-found" as const,
      message: "no"
    })
};

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

describe("withFabricPackage", () => {
  it("adds the pack when the catalog serves it", () => {
    expect(catalogServesFabric(fabricCatalog)).toBe(true);
    expect(withFabricPackage([], fabricCatalog)).toEqual([FABRIC_PACKAGE]);
  });

  it("leaves the allowlist alone when the pack is not installed", () => {
    expect(withFabricPackage(["@acme/x"], emptyCatalog)).toEqual(["@acme/x"]);
    expect(withFabricPackage([], null)).toEqual([]);
  });

  it("adds it once when the caller already consented to it", () => {
    expect(withFabricPackage([FABRIC_PACKAGE], fabricCatalog)).toEqual([
      FABRIC_PACKAGE
    ]);
  });
});

describe("a chat session with Fabric installed", () => {
  it("advertises the pack and the SVG section", () => {
    const session = createChatCodeActSession({
      tools: [],
      executeTool: async () => ({}),
      sandboxModuleCatalog: fabricCatalog
    });
    const prompt = session.systemPromptSection;
    expect(prompt).toContain(FABRIC_PACKAGE);
    expect(prompt).toContain("SVG and vector graphics");
    expect(prompt).toContain("renderSVG");
    expect(prompt).toContain(FABRIC_PROMPT_SECTION.slice(0, 40));
  });

  it("does not advertise Fabric when the catalog has no such pack", () => {
    const session = createChatCodeActSession({
      tools: [],
      executeTool: async () => ({}),
      sandboxModuleCatalog: emptyCatalog
    });
    expect(session.systemPromptSection).not.toContain(FABRIC_PACKAGE);
    expect(session.systemPromptSection).not.toContain(
      "SVG and vector graphics"
    );
  });
});
