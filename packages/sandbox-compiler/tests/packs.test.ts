/**
 * The shipped bridge packs, through the real path a third-party pack takes.
 *
 * No fixtures: the pack directories under `packages/sandbox-packs/` are the
 * ones users install. Each one is discovered from disk, compiled from its npm
 * dependency, resolved through the catalog, and imported by the M1 loader
 * inside QuickJS — with nothing stubbed anywhere in between.
 */

import { afterAll, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  BRIDGE_PACKS,
  createSandboxModuleCatalog,
  discoverSandboxPack,
  type SandboxPackDiscovery
} from "@nodetool-ai/node-sdk";
import { runInSandbox } from "@nodetool-ai/agents";

import { CompiledModuleCache } from "../src/cache.js";
import { compileDiscoveries, createCompiledNpmLookup } from "../src/catalog.js";
import { cleanup } from "./fixtures.js";

const here = dirname(fileURLToPath(import.meta.url));
const PACKS_ROOT = join(here, "..", "..", "sandbox-packs");
const workspace = mkdtempSync(join(tmpdir(), "nodetool-packs-test-"));
const cache = new CompiledModuleCache(join(workspace, "cache"));

afterAll(() => cleanup(workspace));

const PACK_DIRS: Record<string, string> = {
  "@nodetool-ai/sandbox-dates": "sandbox-dates",
  "@nodetool-ai/sandbox-yaml": "sandbox-yaml",
  "@nodetool-ai/sandbox-zip": "sandbox-zip"
};

/** Discover a shipped pack, compile its npm entry, and discover it again. */
async function discoverPack(specifier: string): Promise<SandboxPackDiscovery> {
  const packDir = join(PACKS_ROOT, PACK_DIRS[specifier] ?? "");
  const first = discoverSandboxPack(packDir);
  if (first === undefined) throw new Error(`${specifier} is not a sandbox pack`);
  const reports = await compileDiscoveries([first], { cache });
  const second = discoverSandboxPack(packDir, {
    compiled: createCompiledNpmLookup(reports)
  });
  if (second === undefined) throw new Error(`${specifier} stopped being a sandbox pack`);
  return second;
}

/** The resolution a Code node declaring this one specifier would execute with. */
async function resolveOne(specifier: string) {
  const discovery = await discoverPack(specifier);
  const catalog = createSandboxModuleCatalog([discovery]);
  const resolution = catalog.resolveForExecution([{ specifier }]);
  return { discovery, catalog, resolution };
}

describe("every shipped pack", () => {
  for (const pack of BRIDGE_PACKS) {
    describe(pack.specifier, () => {
      it("is a config-only pack: no authored guest code", () => {
        const manifest = JSON.parse(
          readFileSync(join(PACKS_ROOT, PACK_DIRS[pack.specifier] ?? "", "package.json"), "utf8")
        ) as {
          dependencies?: Record<string, string>;
          nodetool?: { recommended?: boolean; sandboxModules?: { npm?: string; file?: string }[] };
        };
        const modules = manifest.nodetool?.sandboxModules ?? [];
        expect(modules).toHaveLength(1);
        expect(modules[0]?.npm).toBe(pack.library);
        expect(modules[0]?.file).toBeUndefined();
        // The registry mark the index reads, and the dependency it compiles.
        expect(manifest.nodetool?.recommended).toBe(true);
        expect(manifest.dependencies?.[pack.library]).toBeTruthy();
      });

      it("compiles, and its SKILL.md survives discovery", async () => {
        const discovery = await discoverPack(pack.specifier);
        expect(discovery.name).toBe(pack.packName);
        expect(discovery.modules[0]?.specifier).toBe(pack.specifier);
        expect(discovery.modules[0]?.source).toBeDefined();
        expect(
          discovery.statuses.some((status) => status.code === "npm-module-compiled")
        ).toBe(true);
        expect(
          discovery.statuses.some(
            (status) => status.code === "skill-missing" || status.code === "skill-invalid"
          )
        ).toBe(false);
      });

      it("resolves for execution with no error", async () => {
        const { resolution } = await resolveOne(pack.specifier);
        expect(resolution.statuses.filter((status) => status.status === "error")).toEqual([]);
        expect(resolution.modules).toHaveLength(1);
      });
    });
  }
});

describe("sandbox-yaml end to end, in the guest", () => {
  it("parses and dumps YAML through the M1 loader", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-yaml");
    const result = await runInSandbox({
      code: `
        import yaml from "@nodetool-ai/sandbox-yaml";
        const loaded = yaml.load("name: nodetool\\ntags: [a, b]\\n");
        return { loaded, text: yaml.dump(loaded).trim() };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({
      loaded: { name: "nodetool", tags: ["a", "b"] }
    });
  });

  it("refuses a run whose saved digest no longer matches the compiled module", async () => {
    const { catalog } = await resolveOne("@nodetool-ai/sandbox-yaml");
    const drifted = catalog.resolveForExecution([
      { specifier: "@nodetool-ai/sandbox-yaml", contentDigest: "0".repeat(64) }
    ]);
    expect(drifted.statuses[0]?.code).toBe("content-digest-mismatch");
  });
});

describe("sandbox-zip and sandbox-dates in the guest", () => {
  it("round-trips an archive fflate built", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-zip");
    const result = await runInSandbox({
      code: `
        import { zipSync, unzipSync, strToU8, strFromU8 } from "@nodetool-ai/sandbox-zip";
        const archive = zipSync({ "note.txt": strToU8("hello") });
        return { text: strFromU8(unzipSync(archive)["note.txt"]) };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ text: "hello" });
  });

  it("formats a date with date-fns, which the guest has no Intl for", async () => {
    const { resolution } = await resolveOne("@nodetool-ai/sandbox-dates");
    const result = await runInSandbox({
      code: `
        import { addDays, format, parseISO } from "@nodetool-ai/sandbox-dates";
        return { day: format(addDays(parseISO("2026-08-10T00:00:00Z"), 5), "yyyy-MM-dd") };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toEqual({ day: "2026-08-15" });
  });
});
