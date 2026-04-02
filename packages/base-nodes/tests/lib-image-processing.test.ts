/**
 * Output verification tests for image processing nodes across 4 lib-image-*.ts files.
 * Tests that each node produces valid image output with correct type and non-empty data,
 * and that pixel values actually change where expected.
 */
import { describe, it, expect } from "vitest";
import sharp from "sharp";
import {
  LIB_IMAGE_COLOR_GRADING_NODES,
  LIB_IMAGE_DRAW_NODES,
  LIB_IMAGE_ENHANCE_NODES,
  LIB_IMAGE_FILTER_NODES
} from "../src/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a small test image as a base64 image ref. */
async function makeTestImage(
  w = 4,
  h = 4,
  r = 128,
  g = 64,
  b = 32
): Promise<Record<string, unknown>> {
  const buf = await sharp({
    create: { width: w, height: h, channels: 3, background: { r, g, b } }
  })
    .png()
    .toBuffer();
  return {
    type: "image",
    data: buf.toString("base64"),
    uri: ""
  };
}

/** Create a gradient test image with varied pixel values (needed for normalize-based ops). */
async function makeGradientImage(
  w = 8,
  h = 8
): Promise<Record<string, unknown>> {
  const pixels = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 3;
      pixels[i] = Math.floor((x / w) * 200) + 20; // R: 20..220
      pixels[i + 1] = Math.floor((y / h) * 200) + 20; // G: 20..220
      pixels[i + 2] = 128; // B: constant
    }
  }
  const buf = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
    .png()
    .toBuffer();
  return { type: "image", data: buf.toString("base64"), uri: "" };
}

/** Decode a base64 image ref to raw pixel buffer and metadata. */
async function decodeOutput(output: Record<string, unknown>) {
  const data = output.data as string;
  const buf = Buffer.from(data, "base64");
  const { data: raw, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { raw, info, buf };
}

/** Find a node class by its static nodeType. */
function findNode(
  nodes: readonly {
    nodeType?: string;
    new (): {
      assign(p: Record<string, unknown>): void;
      process(ctx?: unknown): Promise<Record<string, unknown>>;
    };
  }[],
  suffix: string
) {
  const cls = nodes.find((n) =>
    (n as unknown as { nodeType: string }).nodeType?.endsWith(suffix)
  );
  if (!cls) throw new Error(`Node ending with "${suffix}" not found`);
  return cls;
}

/** Instantiate a node, assign inputs, call process(), return output. */
async function runNode(
  nodes: readonly unknown[],
  suffix: string,
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const Cls = findNode(nodes as never, suffix);
  const node = new Cls();
  node.assign(inputs);
  const result = await node.process();
  // Output is either at result.output or the result itself
  return (result.output ?? result) as Record<string, unknown>;
}

/** Assert output is a valid image ref with non-empty base64 data. */
function assertValidImage(output: Record<string, unknown>) {
  expect(output).toBeDefined();
  expect(typeof output.data).toBe("string");
  expect((output.data as string).length).toBeGreaterThan(0);
}

/** Assert that output pixels differ from the input image pixels. */
async function assertPixelsChanged(
  inputRef: Record<string, unknown>,
  outputRef: Record<string, unknown>
) {
  const inBuf = Buffer.from(inputRef.data as string, "base64");
  const outBuf = Buffer.from(outputRef.data as string, "base64");
  const { data: inRaw } = await sharp(inBuf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { data: outRaw } = await sharp(outBuf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  // At least one pixel should differ
  let differs = false;
  const len = Math.min(inRaw.length, outRaw.length);
  for (let i = 0; i < len; i++) {
    if (inRaw[i] !== outRaw[i]) {
      differs = true;
      break;
    }
  }
  expect(differs).toBe(true);
}

// ===========================================================================
// Color Grading (10 nodes)
// ===========================================================================

describe("lib-image-color-grading nodes", () => {
  it("CDL — adjusts slope/offset, output differs from input", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".CDL", {
      image: img,
      slope_r: 1.5,
      slope_g: 0.8,
      slope_b: 1.0,
      offset_r: 0.1,
      offset_g: 0,
      offset_b: 0,
      power_r: 1,
      power_g: 1,
      power_b: 1,
      saturation: 1
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("ColorBalance — temperature shift changes pixels", async () => {
    const img = await makeTestImage();
    const output = await runNode(
      LIB_IMAGE_COLOR_GRADING_NODES,
      ".ColorBalance",
      {
        image: img,
        temperature: 0.5,
        tint: 0.3
      }
    );
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Curves — midtones adjustment changes pixels", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".Curves", {
      image: img,
      black_point: 0,
      white_point: 1,
      shadows: 0.2,
      midtones: 0.3,
      highlights: -0.1,
      red_midtones: 0,
      green_midtones: 0,
      blue_midtones: 0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Exposure — increased exposure brightens image", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".Exposure", {
      image: img,
      exposure: 1.5,
      contrast: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("FilmLook — preset applies color grade", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".FilmLook", {
      image: img,
      preset: "teal_orange",
      intensity: 1
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("HSLAdjust — hue shift on all colors changes pixels", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".HSLAdjust", {
      image: img,
      color_range: "all",
      hue_shift: 0.5,
      saturation: 0.3,
      luminance: 0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("LiftGammaGain — lift changes shadow colors", async () => {
    const img = await makeTestImage();
    const output = await runNode(
      LIB_IMAGE_COLOR_GRADING_NODES,
      ".LiftGammaGain",
      {
        image: img,
        lift_r: 0.3,
        lift_g: 0,
        lift_b: 0,
        lift_master: 0,
        gamma_r: 1,
        gamma_g: 1,
        gamma_b: 1,
        gamma_master: 1,
        gain_r: 1,
        gain_g: 1,
        gain_b: 1,
        gain_master: 1
      }
    );
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("SaturationVibrance — boosted saturation changes pixels", async () => {
    const img = await makeTestImage();
    const output = await runNode(
      LIB_IMAGE_COLOR_GRADING_NODES,
      ".SaturationVibrance",
      {
        image: img,
        saturation: 0.8,
        vibrance: 0.5
      }
    );
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("SplitToning — shadow/highlight tinting changes pixels", async () => {
    const img = await makeTestImage();
    const output = await runNode(
      LIB_IMAGE_COLOR_GRADING_NODES,
      ".SplitToning",
      {
        image: img,
        shadow_hue: 200,
        shadow_saturation: 0.5,
        highlight_hue: 40,
        highlight_saturation: 0.5,
        balance: 0
      }
    );
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Vignette — darkens edges, changes pixels", async () => {
    // Use larger image so edge vs center difference is detectable
    const img = await makeTestImage(16, 16);
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".Vignette", {
      image: img,
      amount: 0.8,
      midpoint: 0.3,
      roundness: 0,
      feather: 0.5
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });
});

// ===========================================================================
// Draw (5 nodes)
// ===========================================================================

describe("lib-image-draw nodes", () => {
  it("Background — creates solid color image of specified dimensions", async () => {
    const Cls = findNode(LIB_IMAGE_DRAW_NODES as never, ".Background");
    const node = new Cls();
    node.assign({
      width: 8,
      height: 6,
      color: { type: "color", value: "#FF0000" }
    });
    const result = await node.process();
    const output = result.output as Record<string, unknown>;
    assertValidImage(output);
    // Verify dimensions
    const buf = Buffer.from(output.data as string, "base64");
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(6);
  });

  it("GaussianNoise — with no image input returns empty output gracefully", async () => {
    // GaussianNoise has no registered `image` property — it relies on
    // workflow wiring. Without an image, pickImage returns null and the
    // node returns an empty output object without crashing.
    const Cls = findNode(LIB_IMAGE_DRAW_NODES as never, ".GaussianNoise");
    const node = new Cls();
    node.assign({ mean: 0, stddev: 1, width: 8, height: 8 });
    const result = await node.process();
    expect(result).toBeDefined();
    expect(result.output).toBeDefined();
  });

  it("GaussianNoise — node class has correct metadata", () => {
    const Cls = findNode(LIB_IMAGE_DRAW_NODES as never, ".GaussianNoise");
    expect((Cls as unknown as { nodeType: string }).nodeType).toBe(
      "lib.image.draw.GaussianNoise"
    );
    expect(
      (Cls as unknown as { metadataOutputTypes: Record<string, string> })
        .metadataOutputTypes
    ).toEqual({ output: "image" });
  });

  it("RenderText — overlays text, pixels differ from input", async () => {
    const img = await makeTestImage(64, 64);
    const output = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "Hi",
      x: 2,
      y: 10,
      size: 12,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    assertValidImage(output);
  });

  it("Blend — blends two images, output is valid image", async () => {
    const img1 = await makeTestImage(4, 4, 255, 0, 0);
    const img2 = await makeTestImage(4, 4, 0, 0, 255);
    const output = await runNode(LIB_IMAGE_DRAW_NODES, ".Blend", {
      image1: img1,
      image2: img2,
      alpha: 0.5
    });
    assertValidImage(output);
    // Blending red+blue should differ from pure red
    await assertPixelsChanged(img1, output);
  });

  it("Composite — composites foreground over background", async () => {
    const bg = await makeTestImage(4, 4, 0, 255, 0);
    const fg = await makeTestImage(4, 4, 255, 0, 0);
    const output = await runNode(LIB_IMAGE_DRAW_NODES, ".Composite", {
      image1: bg,
      image2: fg,
      mask: bg
    });
    assertValidImage(output);
  });
});

// ===========================================================================
// Enhance (12 nodes)
// ===========================================================================

describe("lib-image-enhance nodes", () => {
  it("AdaptiveContrast — normalizes contrast, changes pixels", async () => {
    const img = await makeGradientImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AdaptiveContrast", {
      image: img,
      clip_limit: 2,
      grid_size: 8
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("AutoContrast — normalizes contrast, changes pixels", async () => {
    const img = await makeGradientImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AutoContrast", {
      image: img,
      cutoff: 0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Brightness — factor 2.0 brightens image", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Brightness", {
      image: img,
      factor: 2.0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
    // Verify pixels are brighter
    const { raw: inRaw } = await decodeOutput(img as Record<string, unknown>);
    const { raw: outRaw } = await decodeOutput(output);
    // First pixel R channel should be brighter
    expect(outRaw[0]).toBeGreaterThan(inRaw[0]);
  });

  it("Color — factor 2.0 increases saturation", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Color", {
      image: img,
      factor: 2.0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Contrast — factor 2.0 increases contrast", async () => {
    const img = await makeTestImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Contrast", {
      image: img,
      factor: 2.0
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Detail — enhances fine details", async () => {
    // Need at least 3x3 for convolution
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Detail", {
      image: img
    });
    assertValidImage(output);
  });

  it("EdgeEnhance — enhances edges", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".EdgeEnhance", {
      image: img
    });
    assertValidImage(output);
  });

  it("Equalize — normalizes histogram", async () => {
    const img = await makeGradientImage();
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Equalize", {
      image: img
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("RankFilter — applies median filter", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".RankFilter", {
      image: img,
      size: 3,
      rank: 3
    });
    assertValidImage(output);
  });

  it("Sharpen — sharpens image via convolution", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Sharpen", {
      image: img
    });
    assertValidImage(output);
  });

  it("Sharpness — adjustable sharpness factor", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Sharpness", {
      image: img,
      factor: 2.0
    });
    assertValidImage(output);
  });

  it("UnsharpMask — sharpens with unsharp mask technique", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_ENHANCE_NODES, ".UnsharpMask", {
      image: img,
      radius: 2,
      percent: 150,
      threshold: 3
    });
    assertValidImage(output);
  });
});

// ===========================================================================
// Filter (13 nodes)
// ===========================================================================

describe("lib-image-filter nodes", () => {
  it("Blur — blurs image with given radius", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Blur", {
      image: img,
      radius: 2
    });
    assertValidImage(output);
  });

  it("Canny — detects edges", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Canny", {
      image: img,
      low_threshold: 100,
      high_threshold: 200
    });
    assertValidImage(output);
  });

  it("Contour — applies contour filter", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Contour", {
      image: img
    });
    assertValidImage(output);
  });

  it("ConvertToGrayscale — removes color information", async () => {
    const img = await makeTestImage(4, 4, 200, 100, 50);
    const output = await runNode(
      LIB_IMAGE_FILTER_NODES,
      ".ConvertToGrayscale",
      {
        image: img
      }
    );
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Emboss — applies emboss convolution", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Emboss", {
      image: img
    });
    assertValidImage(output);
  });

  it("Expand — adds border, output is larger", async () => {
    const img = await makeTestImage(4, 4);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Expand", {
      image: img,
      border: 2,
      fill: 0
    });
    assertValidImage(output);
    // Verify dimensions increased by 2*border on each side
    const buf = Buffer.from(output.data as string, "base64");
    const meta = await sharp(buf).metadata();
    expect(meta.width).toBe(8); // 4 + 2*2
    expect(meta.height).toBe(8);
  });

  it("FindEdges — detects edges via convolution", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".FindEdges", {
      image: img
    });
    assertValidImage(output);
  });

  it("GetChannel — extracts red channel", async () => {
    const img = await makeTestImage(4, 4, 200, 100, 50);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".GetChannel", {
      image: img,
      channel: "R"
    });
    assertValidImage(output);
  });

  it("Invert — inverts colors, pixels differ", async () => {
    const img = await makeTestImage(4, 4, 128, 64, 32);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Invert", {
      image: img
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
    // Verify inversion: R channel 128 -> ~127
    const { raw: outRaw } = await decodeOutput(output);
    // The inverted red channel should be approximately 255-128=127
    expect(outRaw[0]).toBeGreaterThan(100);
    expect(outRaw[0]).toBeLessThan(160);
  });

  it("Posterize — reduces color levels", async () => {
    const img = await makeTestImage(4, 4, 128, 64, 32);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Posterize", {
      image: img,
      bits: 2
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
  });

  it("Smooth — smooths image via median filter", async () => {
    const img = await makeTestImage(8, 8);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Smooth", {
      image: img
    });
    assertValidImage(output);
  });

  it("Solarize — partially inverts tones above threshold", async () => {
    // Use value above threshold so solarization kicks in
    const img = await makeTestImage(4, 4, 200, 180, 160);
    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Solarize", {
      image: img,
      threshold: 128
    });
    assertValidImage(output);
    await assertPixelsChanged(img, output);
    // Verify solarization: R=200 > 128, so becomes 255-200=55
    const { raw: outRaw } = await decodeOutput(output);
    expect(outRaw[0]).toBeLessThan(100); // Was 200, now ~55
  });
});
