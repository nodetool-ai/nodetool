/**
 * One-shot: rebuild fal-node-type-pricing.json from generated *.ts in @nodetool/fal-nodes.
 * (Same data codegen embeds in `static falUnitPricing`; API metadata omits it.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../../..");
const genDir = path.join(repoRoot, "packages/fal-nodes/src/generated");
const outFile = path.join(genDir, "fal-node-type-pricing.json");

const byNodeType = {};

for (const name of fs.readdirSync(genDir)) {
  if (!name.endsWith(".ts") || name === "index.ts") {
    continue;
  }
  const text = fs.readFileSync(path.join(genDir, name), "utf8");
  const chunks = text.split(/\nexport class /);
  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!/^(\w+) extends FalNode \{/.test(chunk)) {
      continue;
    }
    const nt = /static readonly nodeType = "([^"]+)";/.exec(chunk);
    if (!nt) {
      continue;
    }
    const pm = /static readonly falUnitPricing[^=]+= \{([\s\S]*?)\n  \};/.exec(
      chunk,
    );
    if (!pm) {
      continue;
    }
    const block = pm[1];
    const ep = /endpointId: "([^"]*)"/.exec(block);
    const up = /unitPrice: ([0-9.eE+-]+)/.exec(block);
    const bu = /billingUnit: "([^"]*)"/.exec(block);
    const cur = /currency: "([^"]*)"/.exec(block);
    if (!ep || !up || !bu || !cur) {
      continue;
    }
    byNodeType[nt[1]] = {
      endpoint_id: ep[1],
      unit_price: Number(up[1]),
      billing_unit: bu[1],
      currency: cur[1],
    };
  }
}

const payload = {
  schemaVersion: 1,
  writtenAt: new Date().toISOString(),
  byNodeType,
};

fs.writeFileSync(outFile, `${JSON.stringify(payload, null, 2)}\n`);
console.log(
  "Wrote",
  outFile,
  "—",
  Object.keys(byNodeType).length,
  "entries",
);
