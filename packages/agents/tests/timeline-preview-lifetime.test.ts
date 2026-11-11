import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);
async function probe(name: string, args: string[] = [], env = process.env) {
  const result = await run(process.execPath, [fileURLToPath(new URL(`./fixtures/${name}.mjs`, import.meta.url)), ...args], {
    env, timeout: 15_000, maxBuffer: 1024 * 1024
  });
  return JSON.parse(result.stdout);
}

describe("Dawn child-process qualification", () => {
  it("delivers pixels and releases the process within the declared budgets", async () => {
    const result = await probe("shared-preview-child-completion");
    expect(result.bytes).toBe(160 * 90 * 4);
    expect(result.coldMs).toBeLessThan(10_000);
    expect(result.concurrentMs).toBeLessThan(10_000);
    expect(result.completionMs).toBeLessThan(10_000);
    expect(result.maxRssKiB).toBeLessThan(512 * 1024);
    expect(result.rssGrowthBytes).toBeLessThan(64 * 1024 * 1024);
    expect(result.timings).toHaveLength(20);
  });

  it("reports a missing addon with installation guidance", async () => {
    const result = await probe("shared-preview-runtime", ["--missing-addon"]);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/webgpu/);
    expect(result.error).toMatch(/install/i);
  });

  it.runIf(process.platform === "linux")("reports a missing adapter without CPU fallback", async () => {
    const result = await probe("shared-preview-runtime", [], {
      ...process.env, VK_ICD_FILENAMES: "/nonexistent-s5-icd.json", VK_DRIVER_FILES: "/nonexistent-s5-icd.json"
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/No WebGPU adapter/);
    expect(result.error).toMatch(/mesa-vulkan-drivers/);
  });
});
