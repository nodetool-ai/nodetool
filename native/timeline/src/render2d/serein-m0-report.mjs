#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { pairSereinM0 } from "./serein-m0.mjs";

const dir = process.argv[2];
if (!dir || process.argv.length !== 3) {
  console.error("usage: serein-m0-report.mjs <window-checks-dir>");
  process.exit(1);
}
const failures = [];
function read(name, parse) {
  try { return parse(fs.readFileSync(path.join(dir, name), "utf8")); }
  catch (error) { failures.push(`${name}: ${error.message}`); return null; }
}
const nativeReport = read("m0-serein-native.json", JSON.parse);
const nativeMeta = read("m0-serein-native.meta.json", JSON.parse);
const nativeExit = read("m0-serein-native.exit", (text) => /^\d+$/.test(text.trim()) ? Number(text.trim()) : null);
const webReport = read("m0-web-headed.json", JSON.parse);
const report = pairSereinM0({ nativeReport, nativeMeta: { ...nativeMeta, exit: nativeExit }, webReport });
report.failures.push(...failures);
if (report.failures.length) report.verdict = "fail";
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === "pass" ? 0 : 1;
