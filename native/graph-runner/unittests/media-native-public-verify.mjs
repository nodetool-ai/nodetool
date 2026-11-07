// Test orchestration only. Native codec work runs inside GraphRunner, not Node.
import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const [driver, reference, bundle, directory, ...extra] = process.argv.slice(2);
if (!directory)
  throw new Error(
    "usage: media-native-public-verify.mjs driver reference bundle result-directory [image]"
  );
mkdirSync(directory, { recursive: true });
const results = [];
function run(command, args) {
  const p = spawnSync(command, args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env
  });
  const result = {
    command: [command, ...args],
    exit: p.status,
    signal: p.signal,
    stdout: p.stdout,
    stderr: p.stderr,
    error: p.error?.message
  };
  results.push(result);
  return result;
}
const rendered = run(driver, [bundle, ...extra]);
writeFileSync(
  join(directory, "public-driver.log"),
  rendered.stdout + rendered.stderr
);
if (rendered.exit === 0) {
  const match = /public-media-root: "?([^"\n]+)"?/.exec(rendered.stdout);
  if (!match) throw new Error("Public driver did not report its output root");
  const outputs = JSON.parse(
    readFileSync(join(match[1], "public-results.json"), "utf8")
  );
  if (outputs.length < 4)
    throw new Error("Public driver omitted its separate-job outputs");
  for (const output of outputs) run(reference, [output.path, "1"]);
  const negative = run(reference, [outputs[0].path, "2"]);
  negative.expectedFailure = true;
}
writeFileSync(
  join(directory, "results.json"),
  JSON.stringify(results, null, 2)
);
for (const result of results)
  console.log(
    JSON.stringify({
      command: result.command,
      exit: result.exit,
      signal: result.signal,
      expectedFailure: result.expectedFailure
    })
  );
if (results.some((r) => (r.expectedFailure ? r.exit !== 1 : r.exit !== 0)))
  process.exitCode = 1;
