import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("CLI node registry", () => {
  it("resolves AtlasCloud nodes for single-node runs", () => {
    const cliRoot = fileURLToPath(new URL("../", import.meta.url));
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=nodetool-dev",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        'import { buildFullRegistry } from "./src/node-registry.ts"; console.log((await buildFullRegistry()).has("atlascloud.video.SyncLipsyncV3"));'
      ],
      { cwd: cliRoot, encoding: "utf8" }
    );
    expect(output.trim()).toBe("true");
  });
});

describe("CLI command host policies", () => {
  it("preserves exact full, local workflow/MCP, and DSL pack sets", () => {
    const cliRoot = fileURLToPath(new URL("../", import.meta.url));
    const output = execFileSync(
      process.execPath,
      [
        "--conditions=nodetool-dev",
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `import { NodeRegistry } from "@nodetool-ai/node-sdk";
       import { registerAvailablePacks } from "@nodetool-ai/node-catalog";
       import { buildFullRegistry, CLI_LOCAL_BUILTIN_PACK_POLICY, CLI_DSL_BUILTIN_PACK_POLICY } from "./src/node-registry.ts";
       const local = new NodeRegistry(); await registerAvailablePacks(local, CLI_LOCAL_BUILTIN_PACK_POLICY);
       const dsl = new NodeRegistry(); await registerAvailablePacks(dsl, CLI_DSL_BUILTIN_PACK_POLICY);
       console.log(JSON.stringify([(await buildFullRegistry()).listNodePackageIds(), local.listNodePackageIds(), dsl.listNodePackageIds()]));`
      ],
      { cwd: cliRoot, encoding: "utf8" }
    );
    const domains = ["audio", "automation", "blender", "code", "core", "data", "document", "game", "image", "integration", "llm", "manimgx", "text", "video"];
    const local = [
      ...domains,
      "elevenlabs",
      "fal",
      "huggingface",
      "minimax",
      "replicate",
      "reve",
      "transformers-js",
      "whisper-cpp"
    ];
    expect(JSON.parse(output.trim())).toEqual([
      ["atlascloud", ...local].sort(),
      local.sort(),
      domains
    ]);
  });

  it("routes workflow and MCP entrypoint registration through shared policy", () => {
    const workflow = readFileSync(new URL("../../cli-workflow/src/index.ts", import.meta.url), "utf8");
    const mcp = readFileSync(new URL("../../cli-mcp/src/index.ts", import.meta.url), "utf8");
    const host = readFileSync(new URL("../src/packs/host.ts", import.meta.url), "utf8");
    for (const source of [workflow, mcp]) {
      expect(source.length).toBeGreaterThan(0);
      expect(source).not.toMatch(/register\w+Nodes\(/);
      expect(source).toContain("registerCliPacks(");
      expect(source).toContain('"@nodetool-ai/cli-execution/packs/host"');
      expect(source).toContain('"@nodetool-ai/cli-execution/node-registry"');
    }
    expect(workflow.match(/registerCliPacks\(/g)).toHaveLength(2);
    expect(workflow).toMatch(/registerCliPacks\(\s*registry,\s*CLI_LOCAL_BUILTIN_PACK_POLICY\s*\)/);
    expect(workflow).toMatch(/await\s+registerCliPacks\(\s*NodeRegistry\.global,\s*CLI_DSL_BUILTIN_PACK_POLICY\s*\)/);
    expect(mcp.match(/registerCliPacks\(/g)).toHaveLength(1);
    expect(mcp).toMatch(/registerCliPacks\(\s*registry,\s*CLI_LOCAL_BUILTIN_PACK_POLICY\s*\)/);
    expect(host.length).toBeGreaterThan(0);
    expect(host).toMatch(/await\s+initializeInstalledExecutionHost\(entryUrl,\s*\{/);
    expect(host).toContain("snapshot: await loadCliPackSnapshot()");
    expect(host).toContain("await source.register(registry, policy)");
    expect(host).toContain("await registerAvailablePacks(registry, policy)");
  });
});
