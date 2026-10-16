import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createCanvas } from "@napi-rs/canvas";
import { chromium } from "@playwright/test";
import { build } from "esbuild";
import { expect, it } from "vitest";

declare global { interface Window { verifyCachedAsset: () => Promise<readonly number[] | string> } }

it("revalidates a rejected cached response after the static host repairs its valid image", async () => {
  const canvas = createCanvas(2, 2);
  const original = canvas.toBuffer("image/png");
  canvas.getContext("2d").fillRect(0, 0, 2, 2);
  const replacement = canvas.toBuffer("image/png");
  const digest = createHash("sha256").update(original).digest("hex");
  const path = `/assets/${digest}.png`;
  const bundle = await build({ stdin: { resolveDir: process.cwd(), sourcefile: "verified-cache-control.ts", contents: `
    import { VerifiedStandaloneAssets } from './src/standalone-assets.ts';
    const owner = new VerifiedStandaloneAssets({image:{assetId:'image',digest:${JSON.stringify(digest)},mediaKind:'image'}},
      {image:${JSON.stringify(`.${path}`)}});
    window.verifyCachedAsset = () => owner.bytes('image').then(bytes => Array.from(bytes), error => error.message);
    window.addEventListener('beforeunload', () => owner.dispose(), {once:true});
  ` }, bundle: true, platform: "browser", format: "esm", write: false, logLevel: "silent" });
  const javascript = bundle.outputFiles?.[0]?.contents;
  if (!javascript) { throw new Error("Verified cache control did not bundle"); }
  let requests = 0;
  const server = createServer((request, response) => {
    if (request.url === path) {
      requests += 1;
      response.writeHead(200, { "content-type": "image/png", "cache-control": "public, max-age=31536000" });
      response.end(requests === 1 ? replacement : original);
    } else if (request.url === "/owner.js") { response.writeHead(200, { "content-type": "text/javascript" }); response.end(javascript); }
    else { response.writeHead(200, { "content-type": "text/html" }); response.end('<script type="module" src="/owner.js"></script>'); }
  });
  let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
  try {
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") { throw new Error("Verified asset control server did not bind"); }
    browser = await chromium.launch({ headless: true, chromiumSandbox: true });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.waitForFunction(() => typeof window.verifyCachedAsset === "function");
    expect(await page.evaluate(() => window.verifyCachedAsset())).toMatch(/digest/);
    expect(requests).toBe(1);
    expect(await page.evaluate(() => window.verifyCachedAsset())).toEqual(Array.from(original));
    expect(requests).toBe(2);
  } finally {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
