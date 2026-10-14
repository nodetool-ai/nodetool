import { describe, expect, it } from "vitest";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/node-catalog";
import type { InstalledPackSnapshot } from "../../src/packs/installed.js";
import { explainPack, listPackRows, planPackRemoval, requestedInstallIds, restoreWarning, restartNotice } from "../../src/packs/management.js";

function pack(id: string, requires: string[] = [], runtimeLibraries: string[] = []): CatalogPack {
  return { id, kind: id === "core" ? "core" : "node-pack", npm: { name: `@nodetool-ai/${id}-nodes`, version: "1.2.3", integrity: "" },
    registrar: "register", provides: [], requires, runtimeLibraries, secrets: [], scriptAllowlist: [], installBytes: 1024, nodeCount: 1 };
}
const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "1.2.3", owners: { "fixture.Game": "game" },
  packs: [pack("core"), pack("video"), pack("game", ["video"], ["rapier"]), pack("scene", ["game"])] };
function snapshot(ids: string[]): InstalledPackSnapshot {
  return { mode: { kind: "local", cliRoot: "/project/node_modules/@nodetool-ai/cli", installRoot: "/project", nodeModulesRoot: "/project/node_modules", coreVersion: "1.2.3", pathStyle: "posix" },
    packs: ids.map(id => ({ id, npm: `@nodetool-ai/${id}-nodes`, version: "1.2.3", packageRoot: `/project/node_modules/@nodetool-ai/${id}-nodes`, realPackageRoot: `/project/node_modules/@nodetool-ai/${id}-nodes`, providedPackages: [] })),
    wrongVersions: [], invalidPackages: [] };
}

describe("node pack command reports", () => {
  it("lists installed versions and requirements from the admitted tree", () => {
    const rows = listPackRows(catalog, snapshot(["core", "game"]), new Set(["rapier"]));
    expect(rows.find(row => row.id === "video")).toMatchObject({ installed: false, version: null, requiredBy: ["game"] });
    expect(rows.find(row => row.id === "game")).toMatchObject({ installed: true, version: "1.2.3", kind: "node-pack", installBytes: 1024, nodeCount: 1 });
    expect(rows.find(row => row.id === "rapier")).toMatchObject({ installed: true, kind: "runtime-library", requiredBy: ["game"] });
  });

  it("explains exact node ownership and transitive requirements without guessing namespaces", () => {
    expect(explainPack(catalog, snapshot([]), "fixture.Game")).toMatchObject({ id: "game", installed: false, requires: ["video"], runtimeLibraries: ["rapier"] });
    expect(explainPack(catalog, snapshot([]), "rapier")).toMatchObject({ kind: "runtime-library", requiredBy: ["game"] });
    expect(() => explainPack(catalog, snapshot([]), "fixture.Unknown")).toThrow("Unknown node type");
  });

  it("distinguishes runtime ids, rejects core installs and deduplicates explicit requests", () => {
    expect(requestedInstallIds(catalog, ["game", "rapier", "game"])).toEqual({ packs: ["game"], runtimeLibraries: ["rapier"] });
    expect(() => requestedInstallIds(catalog, ["core"])).toThrow("ships with the CLI");
    expect(() => requestedInstallIds(catalog, ["unknown"])).toThrow("Unknown node pack");
  });

  it("keeps requested packs needed by another installed pack, including transitive requirements", () => {
    expect(planPackRemoval(catalog, ["scene", "game", "video"], ["game", "video"])).toEqual({ remove: [], kept: ["game", "video"], remaining: ["scene", "game", "video"], runtimeLibraries: [] });
    expect(planPackRemoval(catalog, ["game", "video"], ["game", "video"])).toEqual({ remove: ["game", "video"], kept: [], remaining: [], runtimeLibraries: [] });
  });

  it("warns after upgrades without treating desired intent as installed or as authorization", () => {
    const desired = { root: "/project", coreVersion: "1.2.2", packs: ["video", "game"], runtimeLibraries: [] };
    expect(restoreWarning(snapshot(["game"]), desired)).toBe('1 pack from 1.2.2 is not installed for 1.2.3: video. Run "nodetool nodes add --restore".');
    expect(restoreWarning(snapshot(["game", "video"]), desired)).toBeNull();
    expect(restoreWarning(snapshot([]), { ...desired, coreVersion: "1.2.3" })).toBeNull();
    expect(restartNotice(["video", "game", "game"])).toContain("processes to load game, video");
  });
});
