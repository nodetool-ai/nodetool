/**
 * Browser integration tests for the Chrome-extension CDP proxy.
 *
 * These run real headless Chrome with the built extension loaded and exercise
 * the production transport (ExtensionCdpClient/Page) plus the capture_media and
 * upload_asset host logic against deterministic local fixtures. They prove the
 * one thing unit tests cannot: the extension → chrome.debugger → page → back
 * round-trip actually works.
 *
 * Not part of the default `npm test`. Run with `npm run test:integration`
 * (builds the extension first). Requires Chrome and a free port 7777.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  startExtensionBrowser,
  type ExtensionBrowserHarness,
  FIXTURE_PNG_BASE64,
  FIXTURE_MARKER,
  FIXTURE_IMG_INDEX,
  FIXTURE_FILE_INPUT_INDEX
} from "./harness.js";
import { captureMediaInPage } from "../../src/lib/browser-capture.js";
import { uploadAssetToInput } from "../../src/lib/browser-upload.js";

let h: ExtensionBrowserHarness;

beforeAll(async () => {
  h = await startExtensionBrowser();
}, 60_000);

afterAll(async () => {
  await h?.close();
});

describe("extension CDP transport round-trip", () => {
  it("reads the page title through the relay", async () => {
    expect(await h.handle.page.title()).toBe("NT Fixture");
  });

  it("evaluates JS in the page", async () => {
    const marker = await h.handle.page.evaluate(
      () => document.getElementById("hdr")?.textContent ?? null
    );
    expect(marker).toBe(FIXTURE_MARKER);
  });

  it("returns page HTML content", async () => {
    const html = await h.handle.page.content();
    expect(html).toContain(FIXTURE_MARKER);
  });

  it("captures a PNG screenshot", async () => {
    const buf = await h.handle.page.screenshot();
    // PNG magic number.
    expect([...buf.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(buf.length).toBeGreaterThan(100);
  });

  it("clicks an element and observes the DOM mutation", async () => {
    await h.handle.page.click("#btn");
    const text = await h.handle.page.evaluate(
      () => document.getElementById("btn")?.textContent ?? null
    );
    expect(text).toBe("clicked");
  });

  it("fills a text input", async () => {
    await h.handle.page.fill("#text-in", "hello relay");
    const value = await h.handle.page.evaluate(
      () => (document.getElementById("text-in") as HTMLInputElement | null)?.value ?? null
    );
    expect(value).toBe("hello relay");
  });
});

describe("capture_media", () => {
  it("captures an image by explicit URL (in-page fetch rung)", async () => {
    const raw = await captureMediaInPage(h.handle.page, {
      url: h.fixtureImageUrl
    });
    expect(raw.media_b64).toBe(FIXTURE_PNG_BASE64);
    expect(raw.mime_type).toBe("image/png");
    expect(raw.via).toBe("in_page_fetch");
  });

  it("captures an image by element index (data-nt-idx)", async () => {
    const raw = await captureMediaInPage(h.handle.page, {
      index: FIXTURE_IMG_INDEX,
      media_type: "image"
    });
    expect(raw.media_b64).toBe(FIXTURE_PNG_BASE64);
    expect(raw.mime_type).toBe("image/png");
  });
});

describe("upload_asset", () => {
  it("injects an asset into a file input and the page sees it", async () => {
    const contents = "hello nodetool";
    const fileB64 = Buffer.from(contents, "utf8").toString("base64");

    const result = await uploadAssetToInput(h.handle.page, {
      index: FIXTURE_FILE_INPUT_INDEX,
      file_name: "hello.txt",
      file_b64: fileB64,
      mime_type: "text/plain"
    });

    expect(result.uploaded).toBe(true);
    expect(result.file_name).toBe("hello.txt");
    expect(result.bytes).toBe(contents.length);
    // Same machine as Chrome, so the faithful native path should win; accept
    // the DataTransfer fallback too in case a headless build rejects it.
    expect(["native", "data_transfer"]).toContain(result.via);

    const landed = await h.handle.page.evaluate(() => {
      const el = document.getElementById("file-in") as HTMLInputElement | null;
      const f = el?.files?.[0];
      return f ? { name: f.name, size: f.size, type: f.type } : null;
    });
    expect(landed).toEqual({
      name: "hello.txt",
      size: contents.length,
      type: "text/plain"
    });
  });
});
