/**
 * Emits two generated JSON Schema artifacts under `dist/`, both derived from
 * this package's Zod schemas via `z.toJSONSchema` so non-TypeScript
 * consumers never hand-copy a TS shape:
 *
 *  - `processing-messages.schema.json` — `processingMessageSchema` (every
 *    `ProcessingMessage` variant streamed over WebSocket/msgpack and the
 *    Python stdio bridge). See RELIABILITY_ARCHITECTURE.md §8.2.
 *  - `bridge-frames.schema.json` — `bridgeFrameSchema` (every wire frame
 *    `PythonBridgeBase._handleMessage` dispatches: `discover`/`result`/
 *    `error`/`chunk`/`progress`/`comfy.event`). The Python worker repo's test
 *    suite validates its own emitted frames against this artifact — see
 *    RELIABILITY_TASKS.md Track B, B3.
 *
 * Run as part of `npm run build` for this package (see package.json);
 * `--check` verifies both checked-in copies are up to date without writing
 * (used by CI).
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { processingMessageSchema } from "../src/messages.js";
import { bridgeFrameSchema } from "../src/bridge-frames.js";

interface Artifact {
  file: string;
  serialize: () => string;
}

function serializeProcessingMessages(): string {
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

function serializeBridgeFrames(): string {
  const jsonSchema = z.toJSONSchema(bridgeFrameSchema, {
    target: "draft-2020-12",
    unrepresentable: "any"
  });
  const withMeta = {
    $id: "https://nodetool.ai/schemas/protocol/bridge-frames.schema.json",
    description:
      "Every wire frame the Python worker bridge (packages/runtime/src/python-bridge-base.ts) dispatches — discover/result/error/chunk/progress/comfy.event — generated from @nodetool-ai/protocol's Zod schemas. Validate the Python worker's own emissions against this artifact.",
    title: "NodeTool Python Bridge Frame",
    ...jsonSchema
  };
  return `${JSON.stringify(withMeta, null, 2)}\n`;
}

const ARTIFACTS: Artifact[] = [
  { file: "processing-messages.schema.json", serialize: serializeProcessingMessages },
  { file: "bridge-frames.schema.json", serialize: serializeBridgeFrames }
];

function run(): void {
  const check = process.argv.includes("--check");
  const outputDirectory = resolve(
    dirname(fileURLToPath(import.meta.url)),
    "../dist"
  );

  for (const { file, serialize } of ARTIFACTS) {
    const outputPath = resolve(outputDirectory, file);
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
          `Generated schema is stale or missing: ${outputPath}`
        );
      }
      continue;
    }

    mkdirSync(outputDirectory, { recursive: true });
    writeFileSync(outputPath, content, "utf8");
  }
}

const entryPoint = process.argv[1];
if (entryPoint && pathToFileURL(resolve(entryPoint)).href === import.meta.url) {
  run();
}
