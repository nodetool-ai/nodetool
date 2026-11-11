import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { createRenderChild, renderChildEntry, type RenderChildRequest } from "../src/timeline-preview/render-child-client.js";

const request: RenderChildRequest = {
  width: 16, height: 16, referenceWidth: 16, referenceHeight: 16,
  layers: [], groups: [], adjustments: []
};
const fixture = new URL("./fixtures/preview-child-failure.mjs", import.meta.url);
afterEach(() => { delete process.env.S5_CHILD_FAILURE; });

describe("preview child ownership", () => {
  it("resolves the source executable", () => {
    expect(renderChildEntry().pathname).toMatch(/render-child.ts$/);
  });
  it("resolves the flattened backend executable", async () => {
    const root = await mkdtemp(join(tmpdir(), "s5-child-entry-"));
    try {
      await writeFile(join(root, "preview-render-child.mjs"), "");
      expect(renderChildEntry(pathToFileURL(join(root, "server.mjs")).href).pathname).toBe(join(root, "preview-render-child.mjs"));
    } finally { await rm(root, { recursive: true, force: true }); }
  });
  it("renders through the compiled executable and closes", async () => {
    const child = await createRenderChild(undefined, new URL("../dist/timeline-preview/render-child.js", import.meta.url));
    try { expect((await child.render(request)).pixels.length).toBe(16 * 16 * 4); }
    finally { await child.dispose(); }
  });
  it("reports omitted sources and mattes and clears the next frame report", async () => {
    const child = await createRenderChild();
    const missing = { id: "missing", source: { rgba: new Uint8Array(), width: 2, height: 2 }, opacity: 1, blendMode: "normal" as const, zIndex: 0 };
    const valid = { ...missing, id: "matted", source: { rgba: new Uint8Array(16).fill(255), width: 2, height: 2 }, matte: { layer: missing, mode: "alpha" as const } };
    try {
      const result = await child.render({ ...request, layers: [missing, valid] });
      expect(result.skippedLayerIds).toEqual(["missing", "matted"]);
      expect((await child.render(request)).skippedLayerIds).toEqual([]);
    } finally { await child.dispose(); }
  });
  it("fails explicitly instead of silently omitting a mask or group", async () => {
    const layer = { id: "source", source: { rgba: new Uint8Array(16).fill(255), width: 2, height: 2 }, opacity: 1, blendMode: "normal" as const, zIndex: 0 };
    for (const variant of [{ ...layer, shapeMask: { rgba: new Uint8Array(), width: 2, height: 2 } }, { ...layer, precomposeGroupId: "missing" }]) {
      const child = await createRenderChild();
      try { await expect(child.render({ ...request, layers: [variant] })).rejects.toThrow(/mask could not be uploaded|group missing is missing/); }
      finally { await child.dispose(); }
    }
  });
  it("reports unknown enabled effects across layer, group, adjustment and matte scopes", async () => {
    const child = await createRenderChild();
    const effect = (type: string, enabled = true) => ({ id: type, type, enabled });
    const layer = { id: "source", source: { rgba: new Uint8Array(16).fill(255), width: 2, height: 2 }, opacity: 1, blendMode: "normal" as const, zIndex: 0 };
    try {
      const result = await child.render({ ...request,
        layers: [{ ...layer, effects: [effect("future-layer"), effect("disabled", false)], matte: { mode: "alpha", layer: { ...layer, id: "matte", effects: [effect("future-matte")] } } }],
        groups: [{ id: "group", opacity: 1, blendMode: "normal", zIndex: 0, effects: [effect("future-group")] }],
        adjustments: [{ id: "adjustment", opacity: 1, zIndex: 1, effects: [effect("future-adjustment")] }]
      });
      expect(result.effectsNotApplied).toEqual(["future-adjustment", "future-group", "future-layer", "future-matte"]);
      expect((await child.render(request)).effectsNotApplied).toEqual([]);
    } finally { await child.dispose(); }
  });
  it("exits when its parent disconnects before renderer imports finish", async () => {
    const result = await promisify(execFile)(process.execPath, [new URL("./fixtures/preview-child-parent-exit.mjs", import.meta.url).pathname], { timeout: 10_000 });
    const pid = Number(result.stdout.trim());
    try {
      await expect.poll(() => {
        try { process.kill(pid, 0); return false; } catch { return true; }
      }, { timeout: 10_000 }).toBe(true);
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch { /* The process has already exited. */ }
    }
  });
  it("rejects an already cancelled pass without spawning", async () => {
    await expect(createRenderChild(AbortSignal.abort())).rejects.toThrow();
  });
  it("kills an unresponsive child and waits for exit on timeout", async () => {
    const child = await createRenderChild(undefined, fixture, 100);
    const start = performance.now();
    try {
      await expect(child.render(request)).rejects.toThrow(/timed out/);
    } finally { await child.dispose(); }
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it("cancels an in-flight frame and escalates SIGTERM", async () => {
    const controller = new AbortController();
    const child = await createRenderChild(controller.signal, fixture);
    const result = child.render(request);
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    await child.dispose();
  });
  it.runIf(process.platform === "linux")("fails an actual renderer crash and lets a later pass render", async () => {
    const child = await createRenderChild();
    try {
      expect((await child.render(request)).pixels.length).toBe(1024);
      const pids = (await readFile(`/proc/self/task/${process.pid}/children`, "utf8")).trim().split(/\s+/).map(Number);
      expect(pids).toHaveLength(1);
      process.kill(pids[0], "SIGSTOP");
      const assertion = expect(child.render(request)).rejects.toThrow(/SIGKILL/);
      process.kill(pids[0], "SIGKILL");
      await assertion;
    } finally { await child.dispose(); }
    const next = await createRenderChild();
    try { expect((await next.render(request)).pixels.length).toBe(1024); }
    finally { await next.dispose(); }
  });
  it("queues passes and cancels a waiter without stopping another render", async () => {
    const first = await createRenderChild();
    const controller = new AbortController();
    const cancelled = createRenderChild(controller.signal);
    const assertion = expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    let acquired = false;
    const next = createRenderChild().then(child => { acquired = true; return child; });
    controller.abort();
    // Rejection must finish while the predecessor still owns a live renderer.
    await assertion;
    expect(acquired).toBe(false);
    try {
      expect((await first.render(request)).pixels.length).toBe(1024);
      expect(acquired).toBe(false);
    }
    finally { await first.dispose(); }
    const second = await next;
    try { expect((await second.render(request)).pixels.length).toBe(1024); }
    finally { await second.dispose(); }
  });
  it("rejects an oversized frame before sending it", async () => {
    const child = await createRenderChild(undefined, fixture);
    try {
      await expect(child.render({ ...request, layers: [{ source: { rgba: new Uint8Array(64 * 1024 * 1024), width: 4096, height: 4096 } }] } as RenderChildRequest)).rejects.toThrow(/transfer limit/);
    } finally { await child.dispose(); }
  });
  it.runIf(process.platform === "linux")("preserves missing-adapter installation guidance across IPC", async () => {
    const previous = process.env.VK_ICD_FILENAMES;
    const previousDriver = process.env.VK_DRIVER_FILES;
    process.env.VK_ICD_FILENAMES = "/nonexistent-s5-icd.json";
    process.env.VK_DRIVER_FILES = "/nonexistent-s5-icd.json";
    const child = await createRenderChild();
    try { await expect(child.render(request)).rejects.toThrow(/mesa-vulkan-drivers/); }
    finally {
      await child.dispose();
      if (previous === undefined) delete process.env.VK_ICD_FILENAMES;
      else process.env.VK_ICD_FILENAMES = previous;
      if (previousDriver === undefined) delete process.env.VK_DRIVER_FILES;
      else process.env.VK_DRIVER_FILES = previousDriver;
    }
  });
});
