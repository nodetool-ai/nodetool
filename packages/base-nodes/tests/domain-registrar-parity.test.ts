import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import type { NodeClass, RegisterNodeOptions } from "@nodetool-ai/node-sdk";
import { registerCoreNodes } from "@nodetool-ai/core-nodes";
import { registerTextNodes } from "@nodetool-ai/text-nodes";
import { registerLlmNodes } from "@nodetool-ai/llm-nodes";
import { registerCodeNodes } from "@nodetool-ai/code-nodes";
import { registerDataNodes } from "@nodetool-ai/data-nodes";
import { registerDocumentNodes } from "@nodetool-ai/document-nodes";
import { registerImageNodes } from "@nodetool-ai/image-nodes";
import { registerAudioNodes } from "@nodetool-ai/audio-nodes";
import { registerVideoNodes } from "@nodetool-ai/video-nodes";
import { registerIntegrationNodes } from "@nodetool-ai/integration-nodes";
import { registerAutomationNodes } from "@nodetool-ai/automation-nodes";
import { registerGameNodes } from "@nodetool-ai/game-nodes";
import { registerBlenderNodes } from "@nodetool-ai/blender-nodes";
import { registerManimgxNodes } from "@nodetool-ai/manimgx-nodes";
import { ALL_BASE_NODES, registerBaseNodes } from "../src/index.js";
import { LEGACY_DOMAIN_METADATA } from "./fixtures/legacy-domain-registration.js";

const DOMAIN_REGISTRARS = {
  core: registerCoreNodes,
  text: registerTextNodes,
  llm: registerLlmNodes,
  code: registerCodeNodes,
  data: registerDataNodes,
  document: registerDocumentNodes,
  image: registerImageNodes,
  audio: registerAudioNodes,
  video: registerVideoNodes,
  integration: registerIntegrationNodes,
  automation: registerAutomationNodes,
  game: registerGameNodes,
  blender: registerBlenderNodes,
  manimgx: registerManimgxNodes
};

const LEGACY_DOMAIN_OWNERS: Record<string, string[]> = JSON.parse(
  readFileSync(new URL("./fixtures/legacy-domain-owners.json", import.meta.url), "utf8")
);

class UniqueNodeRegistry extends NodeRegistry {
  override register(nodeClass: NodeClass, options?: RegisterNodeOptions): void {
    if (this.getClass(nodeClass.nodeType)) {
      throw new Error(`Duplicate domain registration: ${nodeClass.nodeType}`);
    }
    super.register(nodeClass, options);
  }
}

describe("domain registrar parity", () => {
  it("preserves legacy node order, classes and every metadata field", () => {
    const legacy = new NodeRegistry();
    for (const metadata of LEGACY_DOMAIN_METADATA) {
      const nodeClass = ALL_BASE_NODES.find((entry) => entry.nodeType === metadata.node_type);
      expect(nodeClass).toBeDefined();
      legacy.register(nodeClass!, { metadata });
    }
    const current = new NodeRegistry();
    registerBaseNodes(current);
    expect(current.listMetadata().length).toBeGreaterThan(0);
    expect(current.listMetadata()).toStrictEqual(legacy.listMetadata());
    for (const metadata of legacy.listMetadata()) {
      expect(current.getClass(metadata.node_type)).toBe(legacy.getClass(metadata.node_type));
    }
  });

  it.each(Object.entries(DOMAIN_REGISTRARS))(
    "%s registers only its legacy package types in their existing order",
    (domain, register) => {
      const registry = new UniqueNodeRegistry();
      register(registry);
      expect(registry.listMetadata().map((metadata) => metadata.node_type)).toEqual(
        LEGACY_DOMAIN_OWNERS[domain]
      );
      for (const metadata of registry.listMetadata()) {
        expect(metadata).toStrictEqual(
          LEGACY_DOMAIN_METADATA.find((legacy) => legacy.node_type === metadata.node_type)
        );
      }
    }
  );

  it("rejects ownership shared by two registrars", () => {
    const registry = new UniqueNodeRegistry();
    for (const register of Object.values(DOMAIN_REGISTRARS)) {
      register(registry);
    }
    expect(registry.listMetadata()).toHaveLength(LEGACY_DOMAIN_METADATA.length);
    expect(() => registerCoreNodes(registry)).toThrow("Duplicate domain registration:");
  });

  it("retains the caller's package attribution", () => {
    const registry = new NodeRegistry();
    registry.registerPackage("base", registerBaseNodes);
    for (const metadata of registry.listMetadata()) {
      expect(registry.getNodePackageId(metadata.node_type)).toBe("base");
    }
  });
});
