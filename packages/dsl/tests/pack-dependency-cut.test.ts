import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { readCatalogNodes } from "@nodetool-ai/node-catalog";
import { workflowToDsl } from "../src/export.js";

const source = pathToFileURL(resolve(import.meta.dirname, "../src/index.ts")).href;
const registry = pathToFileURL(resolve(import.meta.dirname, "../src/registry.ts")).href;

function withoutPacks(body: string) {
  return spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import { registerHooks } from 'node:module';
    import { readCatalogIndex } from '@nodetool-ai/node-catalog';
    const hidden = new Set(['@nodetool-ai/base-nodes', ...readCatalogIndex().packs.map(pack => pack.npm.name)]);
    registerHooks({ resolve(specifier, context, next) {
      if ([...hidden].some(name => specifier === name || specifier.startsWith(name + '/'))) {
        const error = new Error('Hidden node pack: ' + specifier);
        error.code = 'ERR_MODULE_NOT_FOUND';
        throw error;
      }
      return next(specifier, context);
    } });
    ${body}
  `], { cwd: resolve(import.meta.dirname, "../../.."), encoding: "utf8", timeout: 30000 });
}

describe("DSL without installed node packs", () => {
  it("uses createNode for catalog nodes without a generated factory namespace", () => {
    const provider = readCatalogNodes().find((node) => node.pack === "fal");
    expect(provider).toBeDefined();
    const dsl = workflowToDsl({ nodes: [{ id: "provider", type: provider!.node_type }], edges: [] });
    expect(dsl).toContain("createNode<Record<string, unknown>>");
    expect(dsl).toContain(JSON.stringify(provider!.node_type));
  });

  it("exports graph factories and script metadata synchronously", () => {
    const child = withoutPacks(`
      const { workflowToDsl, workflowToScript } = await import(${JSON.stringify(source)});
      const graph = { nodes: [{ id: 'n', type: 'nodetool.constant.Integer', properties: { value: 1 } }, { id: 'o', type: 'nodetool.output.Output', properties: { name: 'number' } }], edges: [{ source: 'n', sourceHandle: 'output', target: 'o', targetHandle: 'value' }] };
      const dsl = workflowToDsl(graph);
      const script = workflowToScript(graph, { target: 'node' });
      if (!dsl.includes('constant.integer(') || dsl.includes('createNode')) throw new Error(dsl);
      if (!script.code.includes('nodetool.constant.Integer') || script.outputs[0]?.type !== 'int') throw new Error(JSON.stringify(script));
    `);
    expect(child.status, child.stderr).toBe(0);
  });

  it("keeps missing nodes catalog-only and refuses Python execution", () => {
    const child = withoutPacks(`
      const { buildBuiltinRegistry, createHasTsExecutor, createExecutorResolver } = await import(${JSON.stringify(registry)});
      const { MissingPackError } = await import('@nodetool-ai/node-catalog');
      const builtins = await buildBuiltinRegistry();
      const type = 'nodetool.constant.Integer';
      if (builtins.availability(type) !== 'catalog') throw new Error('Missing catalog metadata');
      if (!createHasTsExecutor(undefined, builtins)(type)) throw new Error('Python candidate');
      try { createExecutorResolver(undefined, builtins, null)({ id: 'n', type }); }
      catch (error) { if (error instanceof MissingPackError && error.details.packs[0]?.id === 'core') process.exit(0); throw error; }
      throw new Error('Missing pack was executed');
    `);
    expect(child.status, child.stderr).toBe(0);
  });
});
