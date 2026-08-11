/**
 * `@nodetool-ai/sandbox-dsl`, through the real path a pack takes.
 *
 * The pack is the answer to a specific failure: the string-typed graph builder
 * it replaced named every node type as free-form text, so a model could invent
 * one and only find out at validation. Here the node types come from generated
 * wrappers, one module per namespace, and a name the DSL does not have is an
 * import error before the program runs.
 *
 * Two things this file pins that no other pack exercises: several public
 * subpath modules from one pack, and authored guest files sharing one internal
 * core rather than each carrying a bundled copy.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { runInSandbox } from "@nodetool-ai/agents";

import { discoverPack, packDir, resolveFor } from "./pack-harness.js";

const SPECIFIER = "@nodetool-ai/sandbox-dsl";
const IMAGE = `${SPECIFIER}/nodetool.image`;
const INPUT = `${SPECIFIER}/nodetool.input`;
const OUTPUT = `${SPECIFIER}/nodetool.output`;

interface DslManifest {
  readonly nodetool: {
    readonly internal: readonly string[];
    readonly sandboxModules: readonly { name: string; kind: string; file?: string }[];
  };
}

function manifest(): DslManifest {
  return JSON.parse(
    readFileSync(join(packDir(SPECIFIER), "package.json"), "utf8")
  ) as DslManifest;
}

describe("the sandbox-dsl pack", () => {
  it("declares one authored module per DSL namespace, plus a root", () => {
    const modules = manifest().nodetool.sandboxModules;
    expect(modules.length).toBeGreaterThan(60);
    expect(modules.every((module) => module.kind === "js")).toBe(true);
    expect(modules.filter((module) => module.name === ".")).toHaveLength(1);
    expect(modules.some((module) => module.name === "nodetool.image")).toBe(true);
    expect(manifest().nodetool.internal).toEqual([
      "sandbox/core.js",
      "sandbox/generated/index.js"
    ]);
  });

  it("keeps every file under the authored-JS cap, sharing one core", () => {
    const dir = packDir(SPECIFIER);
    for (const module of manifest().nodetool.sandboxModules) {
      const file = module.file;
      if (file === undefined) throw new Error(`${module.name} declares no file`);
      // 256 KB is the per-file authored cap in SANDBOX_PACKAGE_LIMITS. The
      // margin is the point: a namespace file is a few kilobytes because the
      // wiring lives in the shared core, not in each entry.
      expect(statSync(join(dir, file)).size).toBeLessThan(32 * 1024);
    }
  });

  it("discovers every namespace as its own specifier", async () => {
    const discovery = await discoverPack(SPECIFIER);
    const specifiers = discovery.modules.map((module) => module.specifier);
    expect(specifiers).toContain(SPECIFIER);
    expect(specifiers).toContain(IMAGE);
    expect(discovery.statuses.filter((status) => status.status === "error")).toEqual([]);
    // The shared core is in the graph exactly once, marked internal, however
    // many entries import it.
    const core = discovery.graph.filter((file) => file.id === "sandbox/core.js");
    expect(core).toHaveLength(1);
    expect(core[0]?.internal).toBe(true);
  });

  it("resolves a subset of namespaces without dragging in the rest", async () => {
    const { resolution } = await resolveFor([SPECIFIER], [IMAGE, INPUT]);
    expect(resolution.statuses.filter((status) => status.status === "error")).toEqual([]);
    expect(resolution.modules.map((module) => module.specifier).sort()).toEqual(
      [IMAGE, INPUT].sort()
    );
  });

  it("builds a graph in the guest from typed node wrappers", async () => {
    const { resolution } = await resolveFor([SPECIFIER], [IMAGE, INPUT, OUTPUT, SPECIFIER]);
    const result = await runInSandbox({
      code: `
        import { workflow } from "${SPECIFIER}";
        import { stringInput } from "${INPUT}";
        import { resize } from "${IMAGE}";
        import { output } from "${OUTPUT}";

        const prompt = stringInput({ name: "prompt", value: "a fox" });
        const smaller = resize({ width: 256, height: 256 });
        const out = output({ name: "image", value: smaller.output() });
        return workflow(out, prompt);
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    const graph = result.result as {
      nodes: { id: string; type: string; properties: Record<string, unknown> }[];
      edges: { source: string; sourceHandle: string; target: string; targetHandle: string }[];
    };
    expect(graph.nodes.map((node) => node.type).sort()).toEqual([
      "nodetool.image.Resize",
      "nodetool.input.StringInput",
      "nodetool.output.Output"
    ]);
    // Ids read like the node type, so a model can name one in a later edit.
    expect(graph.nodes.map((node) => node.id)).toContain("resize");
    expect(graph.edges).toEqual([
      {
        id: "e1_resize_output",
        source: "resize",
        sourceHandle: "output",
        target: "output",
        targetHandle: "value"
      }
    ]);
    expect(
      graph.nodes.find((node) => node.type === "nodetool.image.Resize")?.properties
    ).toEqual({ width: 256, height: 256 });
  });

  it("reaches the whole catalog through the root namespace object", async () => {
    const { resolution } = await resolveFor([SPECIFIER], [SPECIFIER]);
    const result = await runInSandbox({
      code: `
        import * as dsl from "${SPECIFIER}";
        return {
          type: typeof dsl.image.resize,
          namespaces: Object.keys(dsl).length
        };
      `,
      modules: resolution
    });
    expect(result.error).toBeUndefined();
    expect(result.result).toMatchObject({ type: "function" });
    expect((result.result as { namespaces: number }).namespaces).toBeGreaterThan(60);
  });

  it("refuses a node type the DSL does not have, before the program runs", async () => {
    const { resolution } = await resolveFor([SPECIFIER], [IMAGE]);
    const result = await runInSandbox({
      code: `
        import { superResolutionUpscale } from "${IMAGE}";
        return superResolutionUpscale({});
      `,
      modules: resolution
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/superResolutionUpscale/);
  });

  it("refuses a handle interpolated into a string", async () => {
    const { resolution } = await resolveFor([SPECIFIER], [IMAGE, SPECIFIER]);
    const result = await runInSandbox({
      code: `
        import { resize } from "${IMAGE}";
        const smaller = resize({ width: 8, height: 8 });
        return { text: \`use \${smaller.output()}\` };
      `,
      modules: resolution
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/wires an edge/);
  });
});
