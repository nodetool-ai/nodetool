import { readFileSync, writeFileSync } from "node:fs";
import vm from "node:vm";
const fixture = readFileSync(new URL("./intl-icu.test.mjs", import.meta.url), "utf8").replace(/^import .*\n/, "").replace("installIcu();", "");
vm.runInThisContext(fixture);
writeFileSync(process.argv[2], globalThis.G6_RESULTS);
