import { embeddedFontRegistration } from "../guest/host/canvas-fonts.mjs";
import { createCanvas, GlobalFonts } from "../guest/host/canvas.mjs";
import {
  registerBundledFonts,
  bundledFontsDir
} from "@nodetool-ai/timeline/fonts/node";
import { BUNDLED_FONTS } from "../../../packages/timeline/src/fonts/catalog.ts";
import { drawText } from "../../../packages/timeline/src/render/draw.ts";
let missingRejected = false;
try {
  embeddedFontRegistration(GlobalFonts, BUNDLED_FONTS, [])();
} catch (error) {
  missingRejected = /resource is missing/.test(String(error));
}
if (!missingRejected) {
  throw new Error("missing embedded corpus was accepted");
}
const result = registerBundledFonts();
if (
  result.missing.length ||
  result.registered.length !== BUNDLED_FONTS.length ||
  !BUNDLED_FONTS.every((face) => result.registered.includes(face.file))
) {
  throw new Error("relocated catalog font registration failed");
}
if (bundledFontsDir() !== null) {
  throw new Error("embedded fonts must not expose a source-tree path");
}
if (registerBundledFonts() !== result) {
  throw new Error("font registration did not reuse its result");
}
let denied = false;
try {
  GlobalFonts.registerFromPath(CANVAS_SOURCE_FONT_PATH);
} catch (e) {
  denied = /EACCES/.test(String(e));
}
if (!denied) {
  throw new Error("relocated fixture unexpectedly has a file grant");
}
const canvas = createCanvas(128, 96),
  ctx = canvas.getContext("2d");
drawText(
  ctx,
  {
    text: "Timeline",
    fontFamily: "Inter",
    fontSizePx: 20,
    color: "#ffffff",
    shadow: { color: "#000000", blurPx: 2, offsetX: 1, offsetY: 1 }
  },
  128,
  96
);
const data = ctx.getImageData(0, 0, 128, 96).data;
if (!data.some((v, i) => i % 4 === 3 && v > 0)) {
  throw new Error("relocated drawText did not draw");
}
globalThis.canvasResult = JSON.stringify({
  registered: result.registered,
  missing: result.missing,
  bytes: data.length,
  fileGrants: false
});
