/**
 * Emits `dist/processing-messages.schema.json` — the JSON Schema for
 * `processingMessageSchema` (every `ProcessingMessage` variant), generated
 * from the Zod schemas in `src/messages.ts` via `z.toJSONSchema`.
 *
 * Non-TypeScript consumers (the Python worker, external SDKs) validate
 * against this artifact instead of hand-copying the TS shapes — see
 * RELIABILITY_ARCHITECTURE.md §8.2. Run as part of `npm run build` for this
 * package (see package.json); `--check` verifies the checked-in copy is
 * up to date without writing (used by CI).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { processingMessageSchema } from "../src/messages.js";

const OUTPUT_FILE = "processing-messages.schema.json";

function serialize(): string {
  const jsonSchema = z.toJSONSchema(processingMessageSchema, {
    target: "draft-2020-12",
    // Zod-only constructs with no direct JSON Schema equivalent (e.g. the
    // `Float32Array` branch of Chunk.content) fall back to `{}` (any)
    // rather than throwing, since this artifact only needs to describe
    // wire shapes for non-TS consumers.
    unrepresentable: "any"
  });
  const withMeta = {
    $id: "https://nodetool.ai/schemas/protocol/processing-messages.schema.json",
    description:
      "Every ProcessingMessage variant NodeTool streams over WebSocket/msgpack and the Python stdio bridge, generated from @nodetool-ai/protocol's Zod schemas.",
    title: "NodeTool ProcessingMessage",
    ...jsonSchema
  };
  return `${JSON.stringify(withMeta, null, 2)}\n`;
}

function run(): void {
  const check = process.argv.includes("--check");
  const outputDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../dist"
  );
  const outputPath = resolve(outputDirectory, OUTPUT_FILE);
  const content = serialize();

  if (check) {
    let current = "";
    try {
      current = readFileSync(outputPath, "utf8");
    } catch {
      // A missing generated file is reported as stale below.
    }
    if (current !== content) {
      throw new Error(
        `Generated processing-messages schema is stale or missing: ${outputPath}`
      );
    }
    return;
  }

  mkdirSync(outputDirectory, { recursive: true });
  writeFileSync(outputPath, content, "utf8");
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  run();
}
