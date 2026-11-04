import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
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
    const child = createRenderChild(undefined, new URL("../dist/timeline-preview/render-child.js", import.meta.url));
    try { expect((await child.render(request)).length).toBe(16 * 16 * 4); }
    finally { await child.dispose(); }
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
  it("rejects an already cancelled pass without spawning", () => {
    expect(() => createRenderChild(AbortSignal.abort())).toThrow();
  });
  it("kills an unresponsive child and waits for exit on timeout", async () => {
    const child = createRenderChild(undefined, fixture, 100);
    const start = performance.now();
    try {
      await expect(child.render(request)).rejects.toThrow(/timed out/);
    } finally { await child.dispose(); }
    expect(performance.now() - start).toBeLessThan(2000);
  });
  it("cancels an in-flight frame and escalates SIGTERM", async () => {
    const controller = new AbortController();
    const child = createRenderChild(controller.signal, fixture);
    const result = child.render(request);
    const assertion = expect(result).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    await child.dispose();
  });
  it("reports a native crash and frees the concurrency slot", async () => {
    process.env.S5_CHILD_FAILURE = "crash";
    const child = createRenderChild(undefined, fixture);
    try { await expect(child.render(request)).rejects.toThrow(/SIGKILL/); }
    finally { await child.dispose(); }
    const next = createRenderChild(undefined, fixture);
    await next.dispose();
  });
  it("bounds concurrent passes without retaining a queue", async () => {
    const first = createRenderChild(undefined, fixture);
    const second = createRenderChild(undefined, fixture);
    try { expect(() => createRenderChild(undefined, fixture)).toThrow(/busy/); }
    finally { await Promise.all([first.dispose(), second.dispose()]); }
  });
  it("rejects an oversized frame before sending it", async () => {
    const child = createRenderChild(undefined, fixture);
    try {
      await expect(child.render({ ...request, layers: [{ source: { rgba: new Uint8Array(64 * 1024 * 1024), width: 4096, height: 4096 } }] } as RenderChildRequest)).rejects.toThrow(/transfer limit/);
    } finally { await child.dispose(); }
  });
  it.runIf(process.platform === "linux")("preserves missing-adapter installation guidance across IPC", async () => {
    const previous = process.env.VK_ICD_FILENAMES;
    const previousDriver = process.env.VK_DRIVER_FILES;
    process.env.VK_ICD_FILENAMES = "/nonexistent-s5-icd.json";
    process.env.VK_DRIVER_FILES = "/nonexistent-s5-icd.json";
    const child = createRenderChild();
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
