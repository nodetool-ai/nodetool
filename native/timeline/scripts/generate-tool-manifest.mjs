// Writes the shared timeline tool contracts as JSON Schema, for the native
// app's tool parity test (tests/tst_chathost.cpp). The web editor and the
// headless bridge register these contracts directly. The native app writes its
// own narrower schemas, and the test holds each one to a subset of its contract.
//
//   node native/timeline/scripts/generate-tool-manifest.mjs [--check]
//
// Reads the built packages, so run `npm run build:packages` first.
// --check exits 1 when the checked-in manifest differs from the contracts.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { buildTimelineToolContracts } from "@nodetool-ai/protocol/api-schemas/timeline-tool-contracts.js";
import { uiToolParams } from "@nodetool-ai/protocol/api-schemas/ui-tool-contract.js";
import { ANIMATED_PROPERTIES, DEFAULT_BEAT_TOLERANCE_MS, STAGGER_UNITS } from "@nodetool-ai/timeline";

const timeline = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const manifestPath = join(timeline, "resources/chat/tool-manifest.json");

export function buildManifest() {
  const contracts = buildTimelineToolContracts({
    staggerUnits: STAGGER_UNITS,
    animatedProperties: ANIMATED_PROPERTIES,
    beatToleranceMs: DEFAULT_BEAT_TOLERANCE_MS
  });
  const timelineId = z.string().describe("Id of the target timeline sequence.");
  return Object.keys(contracts)
    .sort()
    .map((name) => {
      const contract = contracts[name];
      const parameters = z.toJSONSchema(uiToolParams(contract, { timeline_id: timelineId }), {
        io: "input",
        unrepresentable: "any"
      });
      delete parameters.$schema;
      return { name, description: contract.description, parameters };
    });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const text = `${JSON.stringify(buildManifest(), null, 2)}\n`;
  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = readFileSync(manifestPath, "utf8");
    } catch {
      // A missing manifest differs from the contracts, which the check reports.
    }
    if (current !== text) {
      console.error(`${manifestPath} is out of date. Run node native/timeline/scripts/generate-tool-manifest.mjs`);
      process.exit(1);
    }
  } else {
    writeFileSync(manifestPath, text);
  }
}
