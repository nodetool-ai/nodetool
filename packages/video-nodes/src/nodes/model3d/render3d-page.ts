/// <reference lib="dom" />
/**
 * Headless-page entry for `nodetool.model3d.RenderToImage`.
 *
 * esbuild bundles this file (plus three.js) into `dist/render3d-page.js`
 * (see `scripts/bundle-render3d-page.mjs`). The Node-side driver
 * (`render3d-headless.ts`) evaluates the bundle in a blank headless-Chromium
 * page, then calls `__nodetoolRenderGlb` over CDP with base64 in/out — the
 * only data shapes that survive `Runtime.evaluate` round-trips.
 */

import { renderGlbToPng, type Render3DOptions } from "./render3d-core.js";

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  // Chunked to stay clear of argument-count limits on large images.
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

declare global {
  var __nodetoolRenderGlb:
    | ((glbBase64: string, optionsJson: string) => Promise<string>)
    | undefined;
}

globalThis.__nodetoolRenderGlb = async (
  glbBase64: string,
  optionsJson: string
): Promise<string> => {
  const options = JSON.parse(optionsJson) as Render3DOptions;
  const png = await renderGlbToPng(base64ToBytes(glbBase64), options);
  return bytesToBase64(png);
};
