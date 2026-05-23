#!/usr/bin/env node
/**
 * Scaffold a new NodeTool node pack.
 *
 *   node scripts/create-pack.mjs <package-name> [target-dir]
 *   npm run create:pack -- <package-name> [target-dir]
 *
 * Generates a self-contained pack: package.json (with the `nodetool` manifest
 * field so the server auto-loads it), tsconfig, an example node, a test, and a
 * README. The generated pack does not depend on the monorepo, so it works as a
 * standalone repository too.
 */

import { mkdirSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

function fail(msg) {
  console.error(`error: ${msg}`);
  process.exit(1);
}

const [, , rawName, rawDir] = process.argv;
if (!rawName) {
  fail(
    "missing package name\n  usage: node scripts/create-pack.mjs <package-name> [target-dir]"
  );
}

// Validate npm package name (optionally scoped).
if (!/^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(rawName)) {
  fail(`invalid package name: ${rawName}`);
}

const name = rawName;
const unscoped = name.includes("/") ? name.split("/")[1] : name;
// Namespace token used in node types: drop a trailing "-nodes", camelize.
const namespace = unscoped.replace(/-nodes$/, "").replace(/[^a-z0-9]+/gi, "_");

const targetDir = resolve(rawDir ?? unscoped);
if (existsSync(targetDir) && readdirSync(targetDir).length > 0) {
  fail(`target directory is not empty: ${targetDir}`);
}

const files = {
  "package.json": `${JSON.stringify(
    {
      name,
      type: "module",
      version: "0.1.0",
      description: "Custom NodeTool node pack",
      main: "dist/index.js",
      types: "dist/index.d.ts",
      scripts: {
        build:
          "node -e \"require('node:fs').rmSync('dist',{recursive:true,force:true})\" && tsc",
        test: "vitest run",
        lint: "tsc --noEmit"
      },
      dependencies: {
        "@nodetool-ai/node-sdk": "latest"
      },
      devDependencies: {
        "@types/node": "^22.0.0",
        typescript: "^5.7.2",
        vitest: "^4.1.2"
      },
      nodetool: {
        apiVersion: 1,
        register: "register"
      },
      exports: {
        ".": {
          types: "./dist/index.d.ts",
          import: "./dist/index.js"
        }
      },
      files: ["dist", "README.md"]
    },
    null,
    2
  )}\n`,

  "tsconfig.json": `${JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        declaration: true,
        experimentalDecorators: true,
        emitDecoratorMetadata: true,
        skipLibCheck: true
      },
      include: ["src"]
    },
    null,
    2
  )}\n`,

  "src/nodes/reverse-text.ts": `import { BaseNode, prop } from "@nodetool-ai/node-sdk";

export class ReverseTextNode extends BaseNode {
  static readonly nodeType = "${namespace}.text.ReverseText";
  static readonly title = "Reverse Text";
  static readonly description = "Reverse the characters of a string.\\n    text, string, reverse";
  static readonly metadataOutputTypes = { output: "str" };

  @prop({ type: "str", default: "", title: "Text" })
  declare text: string;

  // Properties (and connected inputs) are assigned to instance fields before
  // process() is called, so read them from \`this\`.
  async process(): Promise<Record<string, unknown>> {
    const text = String(this.text ?? "");
    return { output: [...text].reverse().join("") };
  }
}
`,

  "src/index.ts": `import type { NodeClass, NodeRegistry } from "@nodetool-ai/node-sdk";
import { ReverseTextNode } from "./nodes/reverse-text.js";

export const ALL_NODES: readonly NodeClass[] = [ReverseTextNode];

/** Called by the NodeTool server's pack loader at startup. */
export function register(registry: NodeRegistry): void {
  for (const nodeClass of ALL_NODES) {
    registry.register(nodeClass);
  }
}
`,

  "tests/reverse-text.test.ts": `import { describe, it, expect } from "vitest";
import { ReverseTextNode } from "../src/nodes/reverse-text.js";

describe("ReverseTextNode", () => {
  it("reverses the input text", async () => {
    const node = new ReverseTextNode({ text: "hello" });
    const result = await node.process();
    expect(result.output).toBe("olleh");
  });
});
`,

  "README.md": `# ${name}

A custom node pack for [NodeTool](https://nodetool.ai).

## Develop

\`\`\`bash
npm install
npm run build   # compile to dist/
npm test
\`\`\`

## Install into NodeTool

The \`nodetool\` field in \`package.json\` marks this as a node pack. Install it
where the NodeTool server can resolve it and restart the server — the pack
loader discovers it automatically and registers its nodes.

\`\`\`bash
npm install ${name}   # or 'npm link' for local development
\`\`\`

## Add a node

1. Create a class in \`src/nodes/\` extending \`BaseNode\`.
2. Export it from \`ALL_NODES\` in \`src/index.ts\`.
3. \`npm run build\`.

See the [custom nodes guide](https://github.com/nodetool-ai/nodetool/blob/main/docs/developer/custom-nodes-guide.md).
`
};

for (const [rel, contents] of Object.entries(files)) {
  const path = join(targetDir, rel);
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, contents);
}

console.log(`Created node pack "${name}" at ${targetDir}`);
console.log("\nNext steps:");
console.log(`  cd ${targetDir}`);
console.log("  npm install");
console.log("  npm run build");
console.log("  npm test");
