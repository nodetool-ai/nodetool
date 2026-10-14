import { afterEach, describe, expect, it, vi } from "vitest";
import type { PackSource } from "../src/pack-source.js";
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
