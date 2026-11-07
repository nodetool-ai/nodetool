import { createServer } from "node:http";
import { writeFile } from "node:fs/promises";
import { build } from "esbuild";
import { chromium } from "playwright";
import { expect, it } from "vitest";
import { getNodeGPUDevice } from "@nodetool-ai/gpu/node";
import { names, renderFixture, fixtureDocument } from "./a432Fixture.js";

it("compares undithered full-resolution Node/Dawn and Chromium WebGPU", async (context) => {
  const bundle = await build({ entryPoints: ["tests/a432Fixture.ts"], bundle: true, write: false,
    platform: "browser", format: "esm", conditions: ["nodetool-dev"] });
  const server = createServer((req, res) => {
    if (req.url === "/fixture.js") {
      res.setHeader("Content-Type", "text/javascript");
      res.end(bundle.outputFiles[0].text);
      return;
    }
    res.setHeader("Content-Type", "text/html");
    res.end('<script type="module">import * as A432 from "/fixture.js"; globalThis.A432 = A432;</script>');
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing probe port");
  let browser;
  try {
    try {
      browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? "/usr/lib/chromium/chromium",
      headless: true, args: ["--enable-unsafe-webgpu", "--enable-webgpu-developer-features",
        "--enable-features=Vulkan", "--use-angle=vulkan", "--ignore-gpu-blocklist",
        ...JSON.parse(process.env.A432_BROWSER_FLAGS ?? "[]")] });
    } catch (error) {
      if (process.env.CI && !process.env.A432_REQUIRE_WEBGPU) {
        context.skip("Chromium unavailable: " + String(error));
        return;
      }
      throw error;
    }
    const page = await browser.newPage();
    await page.goto("http://127.0.0.1:" + address.port);
    // Browser-side module is bundled independently from the same source.
    await page.waitForFunction(() => "A432" in globalThis);
    const probe = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) return null;
      const info = adapter.info;
      const device = await adapter.requestDevice();
      Object.assign(globalThis, { a432Device: device });
      return { vendor: info.vendor, architecture: info.architecture, device: info.device,
        description: info.description, isFallbackAdapter: info.isFallbackAdapter };
    });
    if (!probe) {
      const reason = "Chromium requestAdapter returned null. Canvas2D is forbidden for A43.2.";
      if (process.env.CI && !process.env.A432_REQUIRE_WEBGPU) { process.stderr.write(reason + "\n"); context.skip(reason); return; }
      throw new Error(reason);
    }
    const device = await getNodeGPUDevice();
    const nodeInfo = device.adapterInfo;
    const sameAdapter = nodeInfo.vendor === probe.vendor &&
      (nodeInfo.device === probe.device ||
       (nodeInfo.device.includes("swiftshader") && probe.architecture === "swiftshader") ||
       (nodeInfo.device.includes("llvmpipe") && probe.description.toLowerCase().includes("llvmpipe")));
    if (!sameAdapter && !process.env.A432_ALLOW_CROSS_ADAPTER) {
      const reason = "Same-adapter WebGPU unavailable: Node " + nodeInfo.description + ", browser " + JSON.stringify(probe);
      if (process.env.CI && !process.env.A432_REQUIRE_WEBGPU) { process.stderr.write(reason + "\n"); context.skip(reason); return; }
      throw new Error(reason);
    }
    const results = [];
    const ramps = new Map<string, number[]>();
    for (const name of names) for (const format of ["rgba8unorm", "rgba16float"] as const) {
      const document = fixtureDocument(name);
      const node = await renderFixture(device, name, format, false, document);
      const encoded = await page.evaluate(async ({ name, format, documentJson }) => {
        // Test bundle exports are installed by the local page, not product globals.
        const host = globalThis as unknown as {
          a432Device: GPUDevice;
          A432: { renderFixture: typeof renderFixture };
        };
        // This JSON is the exact locally constructed document used by Node.
        const document: ReturnType<typeof fixtureDocument> = JSON.parse(documentJson);
        const values = await host.A432.renderFixture(host.a432Device, name, format, true, document);
        const bytes = new Uint8Array(Float64Array.from(values).buffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i += 8192) {
          binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
        }
        return btoa(binary);
      }, { name, format, documentJson: JSON.stringify(document) });
      const bytes = Uint8Array.from(Buffer.from(encoded, "base64"));
      const web = new Float64Array(bytes.buffer);
      expect(web.length).toBe(node.length);
      if (name === "ramp") ramps.set(format, node);
      if (name === "blur" || name === "grain") {
        const ramp = ramps.get(format);
        if (!ramp) throw new Error("Missing ramp control");
        expect(node.some((v, i) => v !== ramp[i]), name + " must change the picture").toBe(true);
      }
      const alpha = name === "low-alpha" ? 1 / 16 : name === "fade" ? 0.5 : name === "crossfade" ? 0.75 : 1;
      expect(Math.abs(node[3] - alpha)).toBeLessThanOrEqual(1 / 255);
      expect(Math.abs(web[3] - alpha)).toBeLessThanOrEqual(1 / 255);
      let max = 0, total = 0;
      for (let i = 0; i < node.length; i++) {
        const error = Math.abs(node[i] - web[i]) * 255;
        max = Math.max(max, error); total += error;
      }
      // One UNORM step, or four binary16 ULPs in [0.5,1), for
      // storage rounding through upload, effect, blend and capture.
      const tolerance = format === "rgba8unorm" ? 1 : 4 * 255 / 2048;

      results.push({ name, renderer: "Node/Dawn vs Chromium WebGPU", workingFormat: format,
        max, mean: total / node.length, tolerance, pass: max <= tolerance + 1e-10 });
    }
    const report = { sameAdapter, nodeAdapter: { vendor: device.adapterInfo.vendor, device: device.adapterInfo.device,
      description: device.adapterInfo.description }, browserAdapter: probe, browserVersion: browser.version(), results };
    process.stdout.write(JSON.stringify(report) + "\n");
    if (process.env.A432_REPORT) await writeFile(process.env.A432_REPORT, JSON.stringify(report, null, 2));
    expect(results.filter(row => !row.pass), JSON.stringify(report)).toEqual([]);
  } finally {
    await browser?.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
}, 300000);
