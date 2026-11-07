import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const [driver, reference, bundle, mode] = process.argv.slice(2);
assert.ok(driver && reference && bundle && ["still", "mixed"].includes(mode));
function run(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 120000 });
  assert.equal(result.error, undefined, result.error?.message);
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  return result;
}
const result = run(driver, [bundle]);
assert.match(result.stdout, /timeline-checks: [1-9][0-9]* checks passed/);
const roots = [...result.stderr.matchAll(/^media output root: (.+)$/gm)];
assert.equal(roots.length, 1, "expected one completed native fixture output root");
const files = mode === "still" ? [["actual.mp4", 1]] :
  [["timeline-one-frame.mp4", 1], ["timeline-audio-video.mp4", 2]];
for (const [name, count] of files) {
  const path = join(roots[0][1], name);
  const bytes = readFileSync(path);
  assert.ok(bytes.length > 100);
  assert.equal(bytes.subarray(4, 8).toString("ascii"), "ftyp");
  const decoded = run(reference, [path, String(count)]);
  assert.match(decoded.stdout, new RegExp(`independent libav decode: ${count} frames, 8x8, pixels verified`));
  process.stdout.write(decoded.stdout);
}
