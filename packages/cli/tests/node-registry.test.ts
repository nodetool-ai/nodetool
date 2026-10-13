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

  it("routes all nodetool entrypoint registration through shared policy", () => {
    const source = readFileSync(
      new URL("../src/nodetool-main.ts", import.meta.url),
      "utf8"
    );
    expect(source).not.toMatch(/register\w+Nodes\(/);
    expect(source.match(/registerCliPacks\(/g)).toHaveLength(3);
    expect(
      source.match(
        /registerCliPacks\(registry, CLI_LOCAL_BUILTIN_PACK_POLICY\)/g
      )
    ).toHaveLength(2);
    expect(source).toContain(
      "await registerCliPacks(NodeRegistry.global, CLI_DSL_BUILTIN_PACK_POLICY)"
    );
  });
});
