#!/usr/bin/env tsx
/**
 * Extract a replicate-manifest.json from the existing generated TS node classes.
 * Run from packages/replicate-nodes: npx tsx scripts/extract-manifest.ts
 */

import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getDeclaredPropertiesForClass } from "@nodetool-ai/node-sdk";

const __dirname = dirname(fileURLToPath(import.meta.url));
const generatedDir = join(__dirname, "..", "src", "generated");

const modules = [
  "audio-enhance", "audio-generate", "audio-separate", "audio-speech",
  "audio-transcribe", "embedding", "image-3d", "image-analyze",
  "image-background", "image-enhance", "image-face", "image-generate",
  "image-ocr", "image-process", "image-upscale", "text-generate",
  "video-enhance", "video-face", "video-generate", "video-process"
];

interface ManifestEntry {
  endpointId: string;
  className: string;
  moduleName: string;
  docstring: string;
  tags: string[];
  useCases: string[];
  outputType: string;
  inputFields: Array<{
    name: string;
    apiParamName?: string;
    tsType: string;
    propType: string;
    default: unknown;
    description: string;
    fieldType: string;
    required: boolean;
    enumValues?: string[];
    min?: number;
    max?: number;
  }>;
  outputFields: never[];
  enums: never[];
}

async function main() {
  const manifest: ManifestEntry[] = [];

  for (const modName of modules) {
    const mod = await import(pathToFileURL(join(generatedDir, `${modName}.ts`)).href);
    const arrayKey = Object.keys(mod).find((k) => k.startsWith("REPLICATE_"));
    if (!arrayKey) continue;

    const nodeClasses = mod[arrayKey] as Function[];

    for (const NodeClass of nodeClasses) {
      const nc = NodeClass as any;
      const nodeType = nc.nodeType as string;
      const description = nc.description as string;
      const metaOutput = nc.metadataOutputTypes as Record<string, string>;

      const parts = nodeType.split(".");
      const className = parts[parts.length - 1];
      const moduleName = parts.slice(1, -1).join("-");

      const descLines = description.split("\n");
      const docstring = descLines[0] || "";
      const tags = descLines[1]?.split(", ") || [];

      // Extract endpointId from process() source
      const processStr = NodeClass.prototype.process.toString();
      const endpointMatch = processStr.match(
        /replicateSubmit\([^,]+,\s*"([^"]+)"/
      );
      const endpointId = endpointMatch?.[1] || "";

      // Extract fields from registered properties via node-sdk
      const props = getDeclaredPropertiesForClass(NodeClass);
      const inputFields: ManifestEntry["inputFields"] = props.map((p) => ({
        name: p.name,
        propType: p.options.type || "str",
        tsType:
          p.options.type === "bool"
            ? "boolean"
            : p.options.type === "int" || p.options.type === "float"
              ? "number"
              : "string",
        default: p.options.default ?? "",
        description: p.options.description || "",
        fieldType: "input" as const,
        required: false,
        ...(p.options.values?.length
          ? { enumValues: p.options.values.map(String) }
          : {}),
        ...(p.options.min !== undefined ? { min: p.options.min } : {}),
        ...(p.options.max !== undefined ? { max: p.options.max } : {})
      }));

      manifest.push({
        endpointId,
        className,
        moduleName,
        docstring,
        tags,
        useCases: [],
        outputType: metaOutput?.output || "any",
        inputFields,
        outputFields: [],
        enums: []
      });
    }
  }

  const outPath = join(__dirname, "..", "src", "replicate-manifest.json");
  writeFileSync(outPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifest.length} entries to ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
