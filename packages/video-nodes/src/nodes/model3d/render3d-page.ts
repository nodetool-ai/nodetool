/// <reference lib="dom" />
/**
 * Headless-page entry for `nodetool.model3d.RenderToImage` and for the
 * timeline's `model3d` layers.
 *
 * esbuild bundles this file (plus three.js) into `dist/render3d-page.js`
 * (see `scripts/bundle-render3d-page.mjs`). The Node-side driver
 * (`render3d-headless.ts`) evaluates the bundle in a blank headless-Chromium
 * page, then calls `__nodetoolRenderGlbFrames` over CDP — one session, one
 * PNG per requested frame. Every argument and result is base64 or JSON text,
 * the only data shapes that survive `Runtime.evaluate` round-trips.
 */

import {
  createModel3DRenderSession,
  type Model3DRenderFrame,
  type Model3DSessionOptions
} from "./render3d-core.js";

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
  var __nodetoolRenderGlbFrames:
    | ((
        glbBase64: string,
        optionsJson: string,
        framesJson: string
      ) => Promise<string[]>)
    | undefined;
}

globalThis.__nodetoolRenderGlbFrames = async (
  glbBase64: string,
  optionsJson: string,
  framesJson: string
): Promise<string[]> => {
  const options = JSON.parse(optionsJson) as Model3DSessionOptions;
  const frames = JSON.parse(framesJson) as Model3DRenderFrame[];
  const session = await createModel3DRenderSession(
    base64ToBytes(glbBase64),
    options
  );
  try {
    const pngs: string[] = [];
    for (const frame of frames) {
      // Serial on purpose: one canvas and one WebGL context per session, so a
      // frame has to be encoded before the next one overwrites it.
      const blob = await session
        .render(frame)
        .convertToBlob({ type: "image/png" });
      pngs.push(bytesToBase64(new Uint8Array(await blob.arrayBuffer())));
    }
    return pngs;
  } finally {
    session.dispose();
  }
};
