import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalWorkspace } from "@nodetool-ai/runtime-core";
import { runInSandbox } from "../src/index.js";

describe("canonical lean QuickJS host", () => {
  it("runs explicitly resolved guest modules and denies undeclared imports", async () => {
    const source = "export const double = value => value * 2;";
    const modules = {
      modules: [
        {
          specifier: "@example/math",
          packName: "example",
          contentDigest: "a".repeat(64),
          moduleId: "example/math",
          kind: "js" as const,
          source,
          graph: [
            {
              id: "example/math",
              kind: "js" as const,
              source,
              dependencies: [],
              internal: false
            }
          ]
        }
      ],
      statuses: []
    };
    expect(
      await runInSandbox({
        code: 'import { double } from "@example/math"; await output("value", double(21));',
        modules
      })
    ).toMatchObject({ success: true, outputs: { value: 42 } });
    expect(
      await runInSandbox({
        code: 'import fs from "node:fs"; return fs;',
        modules
      })
    ).toMatchObject({ success: false });
  });
  it("isolates host globals and syncs buffered state while forwarding logs and progress", async () => {
    const state = { count: 0 };
    const logs: string[] = [];
    const progress: number[] = [];
    const options = {
      code: 'state.count++; console.log("invocation", state.count); progress(40, "working"); await output("count", state.count); await output("host", typeof process + ":" + typeof require);',
      globals: { state },
      onLog: (_level: string, message: string) => logs.push(message),
      onProgress: (value: number) => progress.push(value)
    };
    expect(await runInSandbox(options)).toMatchObject({
      success: true,
      outputs: { count: 1, host: "undefined:undefined" }
    });
    expect(state.count).toBe(1);
    expect(await runInSandbox(options)).toMatchObject({
      success: true,
      outputs: { count: 2 }
    });
    expect(state.count).toBe(2);
    expect(logs).toEqual(["invocation 1", "invocation 2"]);
    expect(progress).toEqual([40, 40]);
  });

  it("enforces memory, execution deadlines, output caps and cancellation", async () => {
    expect(
      await runInSandbox({ code: "while (true) {}", timeoutMs: 30 })
    ).toMatchObject({ success: false });
    expect(
      await runInSandbox({
        code: 'const x=[]; for(;;) x.push("x".repeat(100000));',
        limits: { memoryLimitBytes: 1024 * 1024 },
        timeoutMs: 500
      })
    ).toMatchObject({ success: false });
    expect(
      await runInSandbox({
        code: 'await output("big", "x".repeat(2000));',
        limits: { maxOutputSize: 1024 }
      })
    ).toMatchObject({ success: false });
    const controller = new AbortController();
    const pending = runInSandbox({
      code: "while (true) {}",
      signal: controller.signal,
      timeoutMs: 10000
    });
    const timer = setTimeout(() => controller.abort(), 50);
    try {
      expect(await pending).toMatchObject({
        success: false,
        error: "Execution cancelled"
      });
    } finally {
      clearTimeout(timer);
    }
  });

  it("uses injected workspace, scoped secrets and asset bytes without host filesystem access", async () => {
    const directory = await mkdtemp(join(tmpdir(), "sandbox-lean-"));
    try {
      const workspace = createLocalWorkspace(directory);
      const options = {
        workspace,
        getSecret: async (name: string) => `value:${name}`,
        readAsset: async () => new TextEncoder().encode("document")
      };
      const result = await runInSandbox({
        ...options,
        code: 'await workspace.write("file.txt", await getSecret("allowed")); await output("file", await workspace.read("file.txt")); await output("asset", await media.text({type:"document",asset_id:null,uri:"asset://fixture"}));',
        limits: { secretScope: ["allowed"] }
      });
      expect(result).toMatchObject({
        success: true,
        outputs: { file: "value:allowed", asset: "document" }
      });
      expect(
        await runInSandbox({
          ...options,
          code: 'await getSecret("denied");',
          limits: { secretScope: ["allowed"] }
        })
      ).toMatchObject({ success: false });
      expect(
        await runInSandbox({
          ...options,
          code: 'await workspace.read("../outside");'
        })
      ).toMatchObject({ success: false });
      expect(
        await runInSandbox({
          ...options,
          code: 'await workspace.writeBytes("bytes.bin", new Uint8Array([0,255,1]));'
        })
      ).toMatchObject({ success: true });
      expect(await workspace.read("bytes.bin")).toEqual(
        new Uint8Array([0, 255, 1])
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
