import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BaseNode, NodeRegistry } from "@nodetool-ai/node-sdk";
import { importPack, readCatalogIndex, setPackLoaderContext } from "@nodetool-ai/node-catalog";
import { commandFailureExitCode } from "../../src/command-errors.js";
import { runSingleNode } from "../../src/node/run-node.js";

const registry = new NodeRegistry();
vi.mock("../../src/node-registry.js", () => ({ buildFullRegistry: async () => registry }));
const directories: string[] = [];
afterEach(async () => {
  setPackLoaderContext(undefined);
  vi.unstubAllEnvs();
  await Promise.all(directories.splice(0).map(directory => rm(directory, { recursive: true, force: true })));
});

class InstalledLazy extends BaseNode {
  static readonly nodeType = "fixture.NodeRunLazy";
  static readonly title = "Installed lazy fixture";
  static readonly description = "";
  static readonly metadataOutputTypes = { output: "str" };
  async process(): Promise<Record<string, unknown>> { await importPack("game"); return {}; }
}
class Available extends BaseNode {
  static readonly nodeType = "fixture.NodeRunAvailable";
  static readonly title = "Available fixture";
  static readonly description = "";
  static readonly metadataOutputTypes = { output: "str" };
  async process(): Promise<Record<string, unknown>> { return { output: "continued" }; }
}
registry.register(InstalledLazy);
registry.register(Available);

describe("CLI single node lazy pack results", () => {
  it("retains a real installed executor's missing-pack payload for exit3 and re-execution", async () => {
    const directory = await mkdtemp(join(tmpdir(), "node-run-lazy-")); directories.push(directory);
    vi.stubEnv("ASSET_FOLDER", directory);
    setPackLoaderContext({ coreVersion: readCatalogIndex().coreVersion, packs: [], install: { supported: false, reason: "Fixture", command: null } });
    expect(registry.availability(InstalledLazy.nodeType)).toBe("executable");
    const result = await runSingleNode(InstalledLazy.nodeType);
    expect(result).toMatchObject({ ok: false, missingPack: { error: "missing_pack", packs: [{ id: "game" }] } });
    expect(commandFailureExitCode(result)).toBe(3);
    expect(await runSingleNode(Available.nodeType)).toMatchObject({ ok: true, chunks: [{ output: "continued" }] });
  });
});
