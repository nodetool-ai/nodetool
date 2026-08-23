/**
 * What one sandbox run spends moving data across the QuickJS boundary.
 *
 * Run it before and after touching `sandbox-json-transport.ts`, the init
 * prelude, or any bridge: the shapes below are the ones whose cost is dominated
 * by marshaling rather than by the guest's own work, so a regression shows up
 * here before it shows up in a workflow.
 *
 *   npm run bench:sandbox --workspace=packages/agents
 *
 * Numbers are wall clock for a whole `runInSandbox` call, best of N, after a
 * warm-up run that pays for the WASM module. Roughly 10 ms of every row is the
 * fixed cost of building a guest context.
 */

import { performance } from "node:perf_hooks";
import { runInSandbox, type RunSandboxOptions } from "../src/js-sandbox.js";

const REPS = Number(process.env.BENCH_REPS ?? 3);

async function bench(label: string, options: () => RunSandboxOptions) {
  const first = await runInSandbox(options());
  if (!first.success) throw new Error(`${label}: ${first.error}`);
  const times: number[] = [];
  for (let i = 0; i < REPS; i++) {
    const started = performance.now();
    const result = await runInSandbox(options());
    times.push(performance.now() - started);
    if (!result.success) throw new Error(`${label}: ${result.error}`);
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(38)} ${times[0].toFixed(1)}ms`);
}

const rows = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    id: i,
    name: `row${i}`,
    tags: ["a", "b"]
  }));

const cold = performance.now();
await runInSandbox({ code: "return 1;" });
console.log(`cold start (engine load included)      ${(performance.now() - cold).toFixed(1)}ms\n`);

await bench("fixed cost (return 1)", () => ({ code: "return 1;" }));
await bench("cpu: 5M iterations", () => ({
  code: "let s = 0; for (let i = 0; i < 5_000_000; i++) s += i; return s;"
}));

console.log("\n-- guest → host --");
await bench("return 1k objects", () => ({
  code: "return Array.from({length:1000},(_,i)=>({id:i,name:'row'+i,tags:['a','b']}));"
}));
await bench("return 5k objects", () => ({ code: `return Array.from({length:5000},(_,i)=>({id:i,name:'row'+i,tags:['a','b']}));` }));
await bench("return 1MB string", () => ({
  code: "return 'x'.repeat(1_000_000);",
  limits: { maxOutputSize: 10_000_000 }
}));
await bench("return 1MB bytes", () => ({ code: "return new Uint8Array(1_000_000);" }));
await bench("emit 1k objects in one call", () => ({
  code: "await emit('out', Array.from({length:1000},(_,i)=>({id:i}))); return 1;",
  onEmit: async () => undefined
}));
await bench("emit 1k values one at a time", () => ({
  code: "for (let i = 0; i < 1000; i++) await emit('out', {i}); return 1;",
  onEmit: async () => undefined
}));

console.log("\n-- host → guest --");
await bench("inject 1k rows", () => ({
  code: "return inputs.rows.length;",
  globals: { inputs: { rows: rows(1000) } }
}));
await bench("inject 5k rows", () => ({
  code: "return inputs.rows.length;",
  globals: { inputs: { rows: rows(5000) } }
}));
await bench("inject 1k rows, return them", () => ({
  code: "return inputs.rows;",
  globals: { inputs: { rows: rows(1000) } }
}));
await bench("inject a 1MB string", () => ({
  code: "return inputs.text.length;",
  globals: { inputs: { text: "x".repeat(1_000_000) } }
}));

console.log("\n-- round trip --");
await bench("state sync-back over 1k rows", () => ({
  code: "state.rows = inputs.rows; return state.rows.length;",
  globals: { inputs: { rows: rows(1000) }, state: {} }
}));
