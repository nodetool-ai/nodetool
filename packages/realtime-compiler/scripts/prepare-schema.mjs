import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { URL } from "node:url";

const canonical = new URL("../../../native/realtime/schema/plan-v1.schema.json", import.meta.url);
const directory = new URL("../src/generated/", import.meta.url);
// Bundle the canonical asset for both browser and QuickJS consumers, without runtime file I/O.
const schema = JSON.parse(readFileSync(canonical, "utf8"));
mkdirSync(directory, { recursive: true });
writeFileSync(new URL("PlanSchema.ts", directory), `// Generated from native/realtime/schema/plan-v1.schema.json.\nexport const PLAN_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;\n`);
