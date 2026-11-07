import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { compare, failsCheck } from "./compare-visuals.mjs";

export async function captureAndCompare({ qtBinary, webUrl, out, check = false }) {
  const directory = resolve(out);
  const run = (command, args, env = {}) => {
    const child = spawnSync(command, args, { stdio: "inherit", env: { ...process.env, ...env }, timeout: 180000 });
    if (child.error) { throw new Error(`Cannot execute ${command}: ${child.error.message}`, { cause: child.error }); }
    if (child.status !== 0) { throw new Error(`${command} failed (${child.signal || child.status})`); }
  };
  run(process.execPath, [fileURLToPath(new URL("../../../web/scripts/capture-visual-compare.mjs", import.meta.url)), "--out", resolve(directory, "web"), ...(webUrl ? ["--url", new URL("visual-compare.html", webUrl).href] : [])]);
  run(resolve(qtBinary), ["--out", resolve(directory, "qt")], { QT_QPA_PLATFORM: "offscreen", QT_QUICK_BACKEND: "software", QSG_RHI_BACKEND: "software", QT_SCALE_FACTOR: "1", LC_ALL: "C" });
  const result = await compare({ web: resolve(directory, "web"), qt: resolve(directory, "qt"), out: resolve(directory, "report") });
  console.log(JSON.stringify({ counts: result.counts, evidence: result.evidence }));
  return { result, failed: check && failsCheck(result) };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { "qt-binary": { type: "string" }, "web-url": { type: "string" }, out: { type: "string" }, check: { type: "boolean" } } });
    if (!values["qt-binary"] || !values.out) { throw new Error("Usage: visual-compare.mjs --qt-binary FILE --out DIR [--web-url URL] [--check]"); }
    const { failed } = await captureAndCompare({ qtBinary: values["qt-binary"], webUrl: values["web-url"], out: values.out, check: values.check });
    if (failed) { process.exitCode = 1; }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
