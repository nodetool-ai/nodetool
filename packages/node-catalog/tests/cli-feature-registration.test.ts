import { describe, expect, it, vi } from "vitest";
import { NodeRegistry } from "@nodetool-ai/node-sdk";
import { readCatalogIndex } from "../src/catalog-data.js";
import { importPack } from "../src/import-pack.js";
import { registerAvailablePacks, registerCatalogPack } from "../src/register-available-packs.js";

vi.mock("../src/import-pack.js", () => ({
  importPack: vi.fn(async () => ({ register: () => {} }))
}));

describe("CLI feature node registration isolation", () => {
  it("does not import generated CLI feature entries during node discovery", async () => {
    const catalog = readCatalogIndex();
    expect(catalog.packs.find(pack => pack.id === "cli-full")?.kind).toBe("cli-feature");
    vi.mocked(importPack).mockImplementation(async id => {
      const pack = catalog.packs.find(entry => entry.id === id);
      if (!pack) { throw new Error(`Unknown test pack ${id}`); }
      return { [pack.registrar]: () => {} };
    });
    await registerAvailablePacks(new NodeRegistry());
    expect(importPack).toHaveBeenCalled();
    expect(vi.mocked(importPack).mock.calls.every(([id]) => id !== "cli-full")).toBe(true);
  });

  it("rejects explicit node registration of a CLI feature before loading its command module", async () => {
    vi.mocked(importPack).mockClear();
    await expect(registerCatalogPack(new NodeRegistry(), "cli-full")).rejects.toMatchObject({ code: "NOT_A_NODE_PACK", packId: "cli-full" });
    expect(importPack).not.toHaveBeenCalled();
  });
});
