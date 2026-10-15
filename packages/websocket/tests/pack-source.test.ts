import { afterEach, describe, expect, it, vi } from "vitest";
import { createCatalogPackSource, type PackSource } from "../src/pack-source.js";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { BUILTIN_NODE_PACKS } from "@nodetool-ai/protocol";
import { registerBuiltinPacks } from "@nodetool-ai/base-nodes/builtin-packs";
import { getRegisteredProvider } from "@nodetool-ai/runtime";
import {
  applyBuiltinPackEnabled,
  bootstrapNodeRegistry,
  getUnavailableBuiltinPackDiagnostics
} from "../src/node-registry-setup.js";

const source: PackSource = {
  register: () => undefined,
  setEnabled: () => undefined,
  unavailableReason: () => undefined,
  registerProviders: () => undefined
};

afterEach(() => { vi.restoreAllMocks(); });

describe("injected pack source", () => {
  it("preserves bundled metadata with installed catalog packs", async () => {
    const policy = { enabledOverrides: Object.fromEntries(BUILTIN_NODE_PACKS.map((pack) => [pack.id, true])) };
    const bundled = new NodeRegistry();
    registerBuiltinPacks(bundled, policy);
    const catalog = new NodeRegistry();
    await createCatalogPackSource().register(catalog, policy);
    const sortedMetadata = (registry: NodeRegistry) => [...registry.listMetadata()].sort((a, b) => a.node_type.localeCompare(b.node_type));
    expect(sortedMetadata(catalog)).toEqual(sortedMetadata(bundled));
  });

  it("registers installed local providers through their packs", async () => {
    await createCatalogPackSource().registerProviders({});
    expect(getRegisteredProvider("transformers_js")).toBeDefined();
    expect(getRegisteredProvider("whisper_cpp")).toBeDefined();
    expect(getRegisteredProvider("whisper_cpp_server")).toBeDefined();
  });

  it("waits for registration and for the source's toggle completion", async () => {
    let ready = false;
    let enabled = false;
    const injected: PackSource = {
      ...source,
      register: async () => { await Promise.resolve(); ready = true; },
      setEnabled: async () => { await Promise.resolve(); enabled = true; }
    };
    const registry = await bootstrapNodeRegistry({ metadataRoots: [], loadPacks: false, packSource: injected });
    expect(ready).toBe(true);
    await applyBuiltinPackEnabled(registry, "example", true);
    expect(enabled).toBe(true);
  });

  it("propagates registration and toggle failures", async () => {
    await expect(bootstrapNodeRegistry({ metadataRoots: [], loadPacks: false,
      packSource: { ...source, register: async () => { throw new Error("source unavailable"); } }
    })).rejects.toThrow("source unavailable");
    const registry = await bootstrapNodeRegistry({ metadataRoots: [], loadPacks: false,
      packSource: { ...source, setEnabled: async () => { throw new Error("toggle failed"); } }
    });
    await expect(applyBuiltinPackEnabled(registry, "example", true)).rejects.toThrow("toggle failed");
  });

  it("uses the registry's source for availability diagnostics", async () => {
    const registry = await bootstrapNodeRegistry({ metadataRoots: [], loadPacks: false,
      packSource: { ...source, unavailableReason: (pack) => pack.id === "fal" ? "fixture unavailable" : undefined }
    });
    expect(await getUnavailableBuiltinPackDiagnostics(registry)).toEqual([
      expect.objectContaining({ id: "fal", reason: "fixture unavailable" })
    ]);
  });
});
