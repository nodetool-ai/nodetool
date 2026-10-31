import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createCatalog, presetJsonSchema } from "../dist/index.js";

const root = fileURLToPath(new URL("../", import.meta.url));
const rows = [];
for (const kind of readdirSync(join(root, "catalog")).sort()) {
  for (const file of readdirSync(join(root, "catalog", kind)).sort()) {
    const row = JSON.parse(readFileSync(join(root, "catalog", kind, file), "utf8"));
    if (row.kind !== kind || file !== `${row.id}.json` || !row.id.startsWith(`${kind}.`)) {
      throw new Error(`Preset id does not match path: ${kind}/${file}`);
    }
    rows.push(row);
  }
}
createCatalog(rows);
mkdirSync(join(root, "dist"), { recursive: true });
for (const [file, data] of [["preset.schema.json", presetJsonSchema], ["preset-catalog.json", rows]]) {
  const content = `${JSON.stringify(data, null, 2)}\n`;
  if (process.argv.includes("--check")) {
    if (readFileSync(join(root, file), "utf8") !== content) { throw new Error(`Generated file drift: ${file}`); }
  } else {
    writeFileSync(join(root, file), content);
  }
}
if (!process.argv.includes("--check")) {
  writeFileSync(join(root, "dist/preset-catalog.json"), `${JSON.stringify(rows, null, 2)}\n`);
}
