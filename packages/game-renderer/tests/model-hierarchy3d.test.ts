import { resolve } from "node:path";
import { Worker } from "node:worker_threads";
import { build } from "esbuild";
import { afterAll, beforeAll, expect, it } from "vitest";
import { prepareGameModel } from "../src/renderer3d/preparation.js";
import { glb } from "./fixtures/game3d.js";

function hierarchy(nodes: number, duplicate: boolean): Uint8Array {
  return glb({ asset: { version: "2.0" }, scenes: [{ nodes: [0] }], scene: 0,
    nodes: Array.from({ length: nodes }, (_, index) => {
      const children = duplicate ? (index + 1 < nodes ? [index + 1, index + 1] : [])
        : [index * 2 + 1, index * 2 + 2].filter(child => child < nodes);
      return { children };
    }) });
}

interface WorkerResult {
  readonly kind: "complete" | "excess-work";
  readonly calls: number;
  readonly ok?: boolean;
  readonly message?: string;
  readonly visibleNodes?: number;
}

let workerCode: string;
beforeAll(async () => {
  const bundle = await build({ stdin: { resolveDir: resolve("."), sourcefile: "hierarchy-worker.ts", contents: `
    import {parentPort} from "node:worker_threads";
    import {Matrix4} from "three";
    import {prepareGameModel} from "./src/renderer3d/preparation.ts";
    parentPort.once("message", async ({bytes, nodes}) => {
      let calls = 0;
      const multiply = Matrix4.prototype.multiply;
      Matrix4.prototype.multiply = function(matrix) {
        calls++;
        if (calls === nodes + 1) { parentPort.postMessage({kind:"excess-work",calls}); }
        return multiply.call(this,matrix);
      };
      const result = await prepareGameModel(bytes);
      parentPort.postMessage({kind:"complete",calls,ok:result.ok,
        message:result.ok ? undefined : result.diagnostics.map(item=>item.message).join("; "),
        visibleNodes:result.ok ? result.model.nodeIds.length : undefined});
    });
    parentPort.postMessage({kind:"ready"});
  ` }, bundle: true, platform: "node", format: "cjs", write: false });
  const output = bundle.outputFiles?.[0];
  if (!output) { throw new Error("Model hierarchy worker bundle missing"); }
  workerCode = output.text;
});
afterAll(() => { workerCode = ""; });

async function inspectHierarchy(nodes: number, duplicate: boolean): Promise<WorkerResult> {
  const worker = new Worker(workerCode, { eval: true });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<WorkerResult>((accept, reject) => {
      timer = setTimeout(() => reject(new Error("Model hierarchy worker did not finish within its safety watchdog")), 10_000);
      worker.on("error", reject);
      worker.on("exit", code => { if (code !== 0) { reject(new Error(`Model hierarchy worker exited ${code}`)); } });
      worker.on("message", (result: WorkerResult | { readonly kind: "ready" }) => {
        if (result.kind === "ready") { worker.postMessage({ bytes: hierarchy(nodes, duplicate), nodes }); }
        else { accept(result); }
      });
    });
  } finally {
    clearTimeout(timer);
    await worker.terminate();
  }
}

it("rejects a repeated child under the same parent", async () => {
  const result = await prepareGameModel(hierarchy(2, true));
  expect(result.ok).toBe(false);
  if (!result.ok) { expect(result.diagnostics).toContainEqual(expect.objectContaining({ message: expect.stringMatching(/duplicate child/i) })); }
});

it.each([31, 128])("rejects a %i-node duplicate chain before bounds expansion in a killable worker", async nodes => {
  const result = await inspectHierarchy(nodes, true);
  expect(result).toMatchObject({ kind: "complete", calls: 0, ok: false, message: expect.stringMatching(/duplicate child/i) });
});

it.each([127, 1023, 4095])("expands a valid %i-node hierarchy exactly once per node", async nodes => {
  expect(await inspectHierarchy(nodes, false)).toMatchObject({ kind: "complete", calls: nodes, ok: true, visibleNodes: nodes });
});
