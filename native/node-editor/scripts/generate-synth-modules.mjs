#!/usr/bin/env node
// Writes the synth module faceplates the native card bodies draw, from the web
// configs in web/src/components/node_types/synth/: SYNTH_MODULE_CONFIGS and
// AUDIO_EFFECT_CONFIGS, keyed by node type.
//
//   node native/node-editor/scripts/generate-synth-modules.mjs [--check]
//
// --check exits 1 when the checked-in file differs from the web configs.
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const editor = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const synth = resolve(editor, "../../web/src/components/node_types/synth");
const output = join(editor, "resources/synth/modules.json");

const entry = `
const synth = await import(${JSON.stringify(join(synth, "synthModules.ts"))});
const effects = await import(${JSON.stringify(join(synth, "audioEffectModules.ts"))});
process.stdout.write(JSON.stringify({ ...synth.SYNTH_MODULE_CONFIGS, ...effects.AUDIO_EFFECT_CONFIGS }));
`;
const configs = JSON.parse(
  execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", entry], {
    encoding: "utf8"
  })
);
const text = `${JSON.stringify(configs, null, 2)}\n`;

if (process.argv.includes("--check")) {
  if (readFileSync(output, "utf8") !== text) {
    console.error(`${output} is stale. Run node native/node-editor/scripts/generate-synth-modules.mjs`);
    process.exit(1);
  }
  console.log(`${Object.keys(configs).length} synth modules match the web configs.`);
} else {
  writeFileSync(output, text);
  console.log(`Wrote ${Object.keys(configs).length} synth modules to ${output}`);
}
