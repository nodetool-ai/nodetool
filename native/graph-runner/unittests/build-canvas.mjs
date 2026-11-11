import { canvasPlugins } from "../guest/host/canvas-build.mjs";
import { shadowFixture, shadowBounds } from "./canvas-shadow-fixture.mjs";
import { textEncodingBanner } from "../guest/text-encoding-banner.mjs";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { hostModulesPlugin } from "../guest/host-modules.mjs";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const { createCanvas, GlobalFonts } = await import("@napi-rs/canvas");
GlobalFonts.registerFromPath(
  resolve(root, "packages/timeline/fonts/Inter-Variable.ttf")
);
const reference = createCanvas(64, 48).getContext("2d");
reference.font = "20px Inter";
const referenceWidth = reference.measureText("Canvas").width;
const { drawText } =
  await import("../../../packages/timeline/dist/render/draw.js");
const textReference = createCanvas(128, 96).getContext("2d");
drawText(
  textReference,
  { text: "Timeline", fontFamily: "Inter", fontSizePx: 20, color: "#ffffff" },
  128,
  96
);
let minX = 128,
  minY = 96,
  maxX = -1,
  maxY = -1;
const refPixels = textReference.getImageData(0, 0, 128, 96).data;
for (let y = 0; y < 96; y++) {
  for (let x = 0; x < 128; x++) {
    if (refPixels[(y * 128 + x) * 4 + 3] > 16) {
      minX = Math.min(x, minX);
      maxX = Math.max(x, maxX);
      minY = Math.min(y, minY);
      maxY = Math.max(y, maxY);
    }
  }
}
const referenceBounds = [minX, minY, maxX, maxY];
const shadowReferences = {};
for (const kind of [
  "authored",
  "outlined",
  "struck",
  "clipped",
  "transformed"
]) {
  const image = shadowFixture(createCanvas, drawText, kind),
    samples = [];
  if (kind !== "authored" && kind !== "outlined" && kind !== "struck") {
    // A flat interior sample avoids comparing different font backends at an
    // antialiased glyph edge. Geometry is compared independently below.
    for (let y = 140; y < image.height - 3 && samples.length === 0; y++) {
      for (let x = 3; x < image.width - 3; x++) {
        const i = (y * image.width + x) * 4,
          pixel = Array.from(image.data.slice(i, i + 4));
        if (pixel[0] < 250 || pixel[1] > 3 || pixel[2] > 3) {
          continue;
        }
        let flat = true;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const j = ((y + dy) * image.width + x + dx) * 4;
            if (image.data[j] < 250) {
              flat = false;
            }
          }
        }
        if (flat) {
          samples.push({ x, y, pixel });
          break;
        }
      }
    }
    if (!samples.length) {
      throw new Error("Skia shadow reference has no flat shadow interior");
    }
  }
  shadowReferences[kind] = {
    bounds: shadowBounds(
      image,
      kind !== "authored" && kind !== "outlined" && kind !== "struck"
    ),
    samples
  };
}
const wrapper = resolve(root, "native/graph-runner/guest/host/canvas.mjs");
await build({
  entryPoints: [
    resolve(
      root,
      process.argv.includes("--relocated")
        ? "native/graph-runner/unittests/canvas-relocated.test.mjs"
        : "native/graph-runner/unittests/canvas.test.mjs"
    )
  ],
  outfile: process.argv[2],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  banner: { js: textEncodingBanner },
  define: {
    CANVAS_REFERENCE_WIDTH: JSON.stringify(referenceWidth),
    CANVAS_SOURCE_FONT_PATH: JSON.stringify(
      resolve(root, "packages/timeline/fonts/Inter-Variable.ttf")
    ),
    CANVAS_SHADOW_REFERENCES: JSON.stringify(shadowReferences),
    CANVAS_REFERENCE_BOUNDS: JSON.stringify(referenceBounds),
    "import.meta.url": JSON.stringify(
      new URL(
        "../../../packages/timeline/dist/fonts/register-node.js",
        import.meta.url
      ).href
    )
  },
  plugins: [
    ...canvasPlugins(),
    hostModulesPlugin(),
    {
      name: "canvas-test-seams",
      setup(b) {
        b.onResolve({ filter: /^node:(fs|url)$/ }, (args) => ({
          path: resolve(
            root,
            "native/graph-runner/guest/host",
            args.path.slice(5) + ".mjs"
          )
        }));
        b.onResolve({ filter: /^@napi-rs\/canvas$/ }, () => ({
          path: wrapper
        }));
        b.onResolve({ filter: /^@nodetool-ai\/runtime$/ }, () => ({
          path: "runtime",
          namespace: "canvas-test"
        }));
        b.onLoad({ filter: /.*/, namespace: "canvas-test" }, () => ({
          contents: `export {loadCanvas} from ${JSON.stringify(wrapper)};`,
          resolveDir: root
        }));
      }
    }
  ]
});
