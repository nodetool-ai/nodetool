// Measures the guest bundle load: the phase times the runner logs, the
// resident size after load, and the bundle sizes.
//
//   node parity/bench-load.mjs --runner build/nodetool-graph-runner --bundle build/guest.js [--runs 2]
import { spawnSync } from "node:child_process";
import { statSync } from "node:fs";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? fallback : args[i + 1];
};
const runner = flag("runner", "build/nodetool-graph-runner");
const bundle = flag("bundle", "build/guest.js");
const runs = Number(flag("runs", "2"));

const results = [];
for (let i = 0; i < runs; i++) {
  const r = spawnSync(runner, ["run", "--bundle", bundle, "--bench-load"], { encoding: "utf8", maxBuffer: 1 << 26 });
  if (r.status !== 0) {
    console.error(r.stderr);
    process.exit(1);
  }
  const phases = /load phases (\{.*\})/.exec(r.stderr);
  if (!phases) {
    console.error("no 'load phases' line in the runner log");
    process.exit(1);
  }
  results.push({ ...JSON.parse(phases[1]), ...JSON.parse(r.stdout.trim().split("\n").pop()) });
}
const sizes = { bundle_file_bytes: statSync(bundle).size };
console.log(JSON.stringify({ bundle, sizes, runs: results }, null, 2));
if (runs >= 2) {
  const total = (x) => x.read_ms + x.guest_ms + x.catalog_ms;
  const [a, b] = results.map(total);
  const spread = Math.abs(a - b) / Math.max(a, b);
  console.error(`load total ${a.toFixed(0)} ms and ${b.toFixed(0)} ms, spread ${(spread * 100).toFixed(1)}%`);
}
