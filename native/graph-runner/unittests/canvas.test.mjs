import { shadowFixture, shadowBounds } from "./canvas-shadow-fixture.mjs";
import {
  createCanvas,
  ImageData,
  loadImage,
  GlobalFonts,
  installCanvasGlobals
} from "../guest/host/canvas.mjs";
import {
  drawShape,
  drawText
} from "../../../packages/timeline/src/render/draw.ts";
import "../guest/env/index.mjs";
const assert = (value, message) => {
  if (!value) {
    throw new Error(message);
  }
};
let checks = 0;
const check = (value, message) => {
  checks++;
  assert(value, message);
};
const rejects = (fn, pattern) => {
  let error;
  try {
    fn();
  } catch (e) {
    error = e;
  }
  check(
    error && pattern.test(String(error)),
    `expected ${pattern}, got ${error}`
  );
};
const c = createCanvas(64, 48),
  ctx = c.getContext("2d");
ctx.fillStyle = "#ff0000";
ctx.fillRect(0, 0, 16, 16);
check(
  ctx.getImageData(4, 4, 1, 1).data.join(",") === "255,0,0,255",
  "solid fill"
);
ctx.save();
ctx.translate(20, 4);
ctx.fillStyle = "#00ff00";
ctx.fillRect(0, 0, 8, 8);
ctx.restore();
check(
  ctx.getImageData(22, 6, 1, 1).data.join(",") === "0,255,0,255",
  "translated fill"
);
ctx.clearRect(0, 0, 2, 2);
check(ctx.getImageData(0, 0, 1, 1).data[3] === 0, "clear");
const im = new ImageData(new Uint8ClampedArray([10, 20, 30, 255]), 1, 1);
ctx.putImageData(im, 40, 10);
check(
  ctx.getImageData(40, 10, 1, 1).data.join(",") === "10,20,30,255",
  "pixel roundtrip"
);
const synchronous = c.toBuffer();
check(synchronous instanceof Uint8Array, "toBuffer returns bytes at the call");
const encoded = await c.encode();
const blob = await c.convertToBlob();
const blobBytes = new Uint8Array(await blob.arrayBuffer());
check(
  encoded.join(",") === synchronous.join(",") && blobBytes.join(",") === synchronous.join(","),
  "encode and convertToBlob match toBuffer"
);
const decoded = await loadImage(c.toBuffer());
const target = createCanvas(128, 96),
  t = target.getContext("2d");
t.imageSmoothingEnabled = false;
t.drawImage(decoded, 0, 0, 128, 96);
check(
  t.getImageData(10, 10, 1, 1).data.join(",") === "255,0,0,255",
  "PNG decode and scaled image"
);
rejects(() => ctx.measureText("No ambient fonts"), /explicitly registered/);
check(GlobalFonts.registerFromPath(canvasFontPath), "font registration");
ctx.font = "20px Inter";
const width = ctx.measureText("Canvas").width;
check(
  Math.abs(width - CANVAS_REFERENCE_WIDTH) <= 1,
  "Pango vs Skia same-font advance within one pixel"
);
ctx.fillStyle = "#ffffff";
ctx.fillText("Canvas", 0, 40);
check(
  ctx.getImageData(0, 20, 64, 28).data.some((v, i) => i % 4 === 3 && v > 0),
  "real glyph pixels"
);
rejects(() => createCanvas(16384, 16384), /dimensions|budget/);
rejects(() => ctx.fillRect(NaN, 0, 1, 1), /coordinate/);
rejects(() => GlobalFonts.registerFromPath("/etc/passwd"), /EACCES/);
rejects(
  () =>
    GlobalFonts.registerFromPath(canvasFontPath + "/../../../../../etc/passwd"),
  /EACCES|ENOTDIR/
);
try {
  await loadImage("/etc/passwd");
  throw new Error("path unexpectedly loaded");
} catch (e) {
  check(/EACCES/.test(String(e)), "image path denied");
}
installCanvasGlobals();
check(new OffscreenCanvas(2, 2).getContext("webgl") === null, "no fake WebGL");
const rasterCanvas = createCanvas(128, 96),
  raster = rasterCanvas.getContext("2d");
drawShape(
  raster,
  { kind: "rect", fill: "#336699", x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
  128,
  96
);
const shape = raster.getImageData(0, 0, 128, 96);
check(
  raster.getImageData(40, 30, 1, 1).data.join(",") === "51,102,153,255",
  "timeline shape interior"
);
check(
  raster.getImageData(31, 24, 1, 1).data[3] === 0,
  "timeline shape left exterior"
);
check(
  raster.getImageData(96, 72, 1, 1).data[3] === 0,
  "timeline shape right/bottom exterior"
);
check(
  shape.data.filter((v, i) => i % 4 === 3 && v === 255).length === 64 * 48,
  "timeline shape exact area"
);
raster.clearRect(0, 0, 128, 96);
drawText(
  raster,
  { text: "Timeline", fontFamily: "Inter", fontSizePx: 20, color: "#ffffff" },
  128,
  96
);
const text = raster.getImageData(0, 0, 128, 96);
let minX = 128,
  minY = 96,
  maxX = -1,
  maxY = -1;
for (let y = 0; y < 96; y++) {
  for (let x = 0; x < 128; x++) {
    if (text.data[(y * 128 + x) * 4 + 3] > 16) {
      minX = Math.min(x, minX);
      maxX = Math.max(x, maxX);
      minY = Math.min(y, minY);
      maxY = Math.max(y, maxY);
    }
  }
}
const bounds = [minX, minY, maxX, maxY];
check(
  maxX >= minX &&
    bounds.every((v, i) => Math.abs(v - CANVAS_REFERENCE_BOUNDS[i]) <= 2),
  "timeline text bounding box vs Skia within two raster pixels"
);
const source = createCanvas(8, 8),
  sc = source.getContext("2d");
sc.fillStyle = "#ff0000";
sc.fillRect(0, 0, 4, 8);
sc.fillStyle = "#0000ff";
sc.fillRect(4, 0, 4, 8);
const crop = createCanvas(16, 16),
  cc = crop.getContext("2d");
cc.imageSmoothingEnabled = false;
cc.drawImage(source, 4, 0, 4, 8, 2, 3, 8, 8);
check(
  cc.getImageData(3, 4, 1, 1).data.join(",") === "0,0,255,255",
  "source crop selects blue half"
);
check(cc.getImageData(1, 3, 1, 1).data[3] === 0, "crop destination exterior");
cc.fillStyle = "#ff0000";
cc.globalAlpha = 0.5;
cc.fillRect(2, 3, 8, 8);
const mixed = cc.getImageData(3, 4, 1, 1).data;
check(
  Math.abs(mixed[0] - 128) <= 1 &&
    mixed[1] === 0 &&
    Math.abs(mixed[2] - 127) <= 1 &&
    mixed[3] === 255,
  "source-over composition reference"
);
cc.globalAlpha = 1;
cc.setTransform(2, 0, 0, 2, 1, 1);
cc.fillStyle = "#00ff00";
cc.fillRect(0, 0, 2, 2);
cc.resetTransform();
check(
  cc.getImageData(2, 2, 1, 1).data.join(",") === "0,255,0,255",
  "affine scale and translation"
);
cc.save();
cc.beginPath();
cc.rect(0, 0, 2, 2);
cc.clip();
cc.fillStyle = "#ffffff";
cc.fillRect(0, 0, 16, 16);
cc.restore();
check(
  cc.getImageData(0, 0, 1, 1).data.join(",") === "255,255,255,255" &&
    cc.getImageData(3, 3, 1, 1).data.join(",") === "0,255,0,255",
  "clip reference"
);
rejects(() => {
  for (let i = 0; i < 257; i++) {
    cc.save();
  }
}, /save limit/);
for (let i = 0; i < 256; i++) {
  cc.restore();
}
rejects(() => GlobalFonts.register(new Uint8Array(0)), /font budget/);
rejects(() => cc.measureText("a".repeat(65537)), /text limit/);
const gradient = cc.createLinearGradient(0, 0, 16, 0);
gradient.addColorStop(0, "#000000");
gradient.addColorStop(1, "#ffffff");
cc.fillStyle = gradient;
cc.fillRect(0, 8, 16, 8);
const gradientPixel = cc.getImageData(7, 10, 1, 1).data;
check(
  gradientPixel[3] === 255 &&
    Math.abs(gradientPixel[0] - 120) <= 1 &&
    gradientPixel[0] === gradientPixel[1] &&
    gradientPixel[1] === gradientPixel[2],
  "linear gradient sample reference"
);
rejects(() => globalThis.__host.canvas.create(16384, 16384), /budget/);
rejects(() => {
  cc.filter = "blur(1px)";
  cc.fillRect(0, 0, 1, 1);
}, /filter/);
cc.filter = "none";
// Native host calls must enforce the limits even when the wrapper is bypassed.
const direct = globalThis.__host.canvas.create(1, 1);
rejects(() => {
  for (let i = 0; i < 257; i++) {
    direct.call("save", [], cc.state);
  }
}, /save limit/);
for (let i = 0; i < 256; i++) {
  direct.call("restore", [], cc.state);
}
rejects(() => {
  for (let i = 0; i < 65537; i++) {
    direct.call("lineTo", [0, 0], cc.state);
  }
}, /path command limit/);
direct.call("beginPath", [], cc.state);
const shadowResults = {};
for (const kind of [
  "authored",
  "outlined",
  "struck",
  "clipped",
  "transformed"
]) {
  const image = shadowFixture(createCanvas, drawText, kind),
    reference = CANVAS_SHADOW_REFERENCES[kind];
  const bounds = shadowBounds(
    image,
    kind !== "authored" && kind !== "outlined" && kind !== "struck"
  );
  check(
    bounds[2] >= bounds[0] &&
      bounds.every((v, i) => Math.abs(v - reference.bounds[i]) <= 2),
    "authored shadow " +
      kind +
      " bounds vs Skia within two raster pixels: " +
      bounds +
      " vs " +
      reference.bounds
  );
  for (const sample of reference.samples) {
    const pixel = Array.from(
      image.data.slice(
        (sample.y * image.width + sample.x) * 4,
        (sample.y * image.width + sample.x) * 4 + 4
      )
    );
    check(
      pixel.every((v, i) => Math.abs(v - sample.pixel[i]) <= 2),
      "shadow " +
        kind +
        " interior RGBA vs Skia within two channel units: " +
        pixel +
        " vs " +
        sample.pixel
    );
  }
  if (kind === "clipped") {
    check(
      image.data
        .slice(0, 135 * image.width * 4)
        .every((v, i) => v === [32, 64, 96, 255][i % 4]),
      "shadow output respects clip while off-clip text still casts"
    );
  }
  shadowResults[kind] = bounds;
}
// @napi-rs/canvas ignores globalAlpha on its shadow and applies shadow-color
// alpha twice. The independent source-over equation is authoritative here.
const alphaShadow = shadowFixture(createCanvas, drawText, "alpha");
for (const sample of CANVAS_SHADOW_REFERENCES.clipped.samples) {
  const i = (sample.y * alphaShadow.width + sample.x) * 4;
  const pixel = Array.from(alphaShadow.data.slice(i, i + 4));
  check(
    pixel.every((v, j) => Math.abs(v - [116, 40, 60, 255][j]) <= 2),
    "shadow globalAlpha/color alpha source-over reference: " + pixel
  );
}
const shadowLimit = createCanvas(16, 16).getContext("2d");
shadowLimit.font = "12px Inter";
shadowLimit.shadowColor = "#000000";
shadowLimit.shadowBlur = 129;
rejects(() => shadowLimit.fillText("H", 1, 12), /shadow parameter limit/);
shadowLimit.shadowBlur = 0;
shadowLimit.shadowOffsetX = 4097;
rejects(() => shadowLimit.fillText("H", 1, 12), /shadow parameter limit/);
shadowLimit.shadowOffsetX = 0;
shadowLimit.shadowBlur = 1e-300;
shadowLimit.fillText("H", 1, 12);
ctx.save();
ctx.setTransform(1.2, 0.3, -0.1, 0.8, 5, 7);
check(
  ctx.measureText("Canvas").width === width,
  "text metrics remain independent of output transform"
);
ctx.restore();
const expensiveShadow = createCanvas(2048, 2048).getContext("2d");
expensiveShadow.font = "2000px Inter";
expensiveShadow.shadowColor = "#000000";
expensiveShadow.shadowBlur = 128;
rejects(() => expensiveShadow.fillText("H", 100, 1900), /shadow work budget/);
globalThis.canvasResult = JSON.stringify({
  checks,
  shadowResults,
  width,
  referenceWidth: CANVAS_REFERENCE_WIDTH,
  bounds,
  referenceBounds: CANVAS_REFERENCE_BOUNDS,
  shape: shape.data.length,
  text: text.data.length
});
