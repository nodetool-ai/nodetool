import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { preparePackRemoval } from "../src/packs/removal-selection.js";
import type { CatalogPack, NodeCatalogIndex } from "@nodetool-ai/pack-core";

it("includes declared npm builtin polyfills in removal while retaining user dependencies and data", async () => {
  const root = await mkdtemp(join(tmpdir(), "pack-removal-builtins-"));
  const cliRoot = join(root, "node_modules/@nodetool-ai/cli");
  const pack: CatalogPack = { id: "cli-full", kind: "cli-feature", npm: { name: "@nodetool-ai/cli-full", version: "0.8.4", integrity: "sha512-fixture" }, registrar: "feature", provides: [], requires: [], runtimeLibraries: [], secrets: [], scriptAllowlist: [], installBytes: 0, nodeCount: 0 };
  const catalog: NodeCatalogIndex = { schemaVersion: 1, coreVersion: "0.8.4", packs: [pack], owners: {} };
  const fixtures = [
    { folder: "@nodetool-ai/cli", name: "@nodetool-ai/cli", dependencies: {} },
    { folder: "@nodetool-ai/cli-full", name: "@nodetool-ai/cli-full", dependencies: { buffer: "*", events: "*", stream: "*", util: "*", "compat-buffer": "npm:buffer@0.8.4", "node:fs": "*" } },
    { folder: "unrelated", name: "unrelated", dependencies: { events: "*" } },
    ...["buffer", "events", "stream", "util"].map(name => ({ folder: name, name, dependencies: {} })),
    { folder: "compat-buffer", name: "buffer", dependencies: {} }
  ];
  try {
    for (const fixture of fixtures) {
      const directory = join(root, "node_modules", fixture.folder);
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, "package.json"), JSON.stringify({ name: fixture.name, version: "0.8.4", dependencies: fixture.dependencies }));
    }
    const manifest = JSON.stringify({ dependencies: { "@nodetool-ai/cli": "0.8.4", "@nodetool-ai/cli-full": "0.8.4", unrelated: "0.8.4" } });
    await writeFile(join(root, "package.json"), manifest);
    await writeFile(join(root, "workflow.json"), "saved workflow data");
    await writeFile(join(root, "node_modules/.package-lock.json"), JSON.stringify({ packages: Object.fromEntries(fixtures.map(fixture => [`node_modules/${fixture.folder}`, { version: "0.8.4", integrity: "sha512-fixture" }])) }));
    const result = await preparePackRemoval({
      mode: { kind: "local", cliRoot, installRoot: root, nodeModulesRoot: join(root, "node_modules"), coreVersion: "0.8.4", pathStyle: "posix" },
      packs: ["cli-full"], stateFile: join(root, "state.json"), catalog
    });
    expect([...result.removePaths].sort()).toEqual([
      "node_modules/@nodetool-ai/cli-full", "node_modules/buffer", "node_modules/compat-buffer", "node_modules/stream", "node_modules/util"
    ]);
    expect(result.npmNames).toEqual(["@nodetool-ai/cli-full"]);
    expect(await readFile(join(root, "package.json"), "utf8")).toBe(manifest);
    expect(await readFile(join(root, "workflow.json"), "utf8")).toBe("saved workflow data");
    expect(JSON.parse(await readFile(join(root, "node_modules/events/package.json"), "utf8")).name).toBe("events");
    await writeFile(join(root, "node_modules/@nodetool-ai/cli-full/package.json"), JSON.stringify({ name: pack.npm.name, version: "0.8.4", dependencies: { "../escape": "*" } }));
    await expect(preparePackRemoval({
      mode: { kind: "local", cliRoot, installRoot: root, nodeModulesRoot: join(root, "node_modules"), coreVersion: "0.8.4", pathStyle: "posix" },
      packs: ["cli-full"], stateFile: join(root, "state.json"), catalog
    })).rejects.toThrow("Invalid npm dependency name");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
