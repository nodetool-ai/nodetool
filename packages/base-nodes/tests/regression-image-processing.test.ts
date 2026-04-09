/**
 * Regression tests for image processing node bugs that were fixed.
 * Each test verifies the specific behavior that was broken in the old implementation
 * and should FAIL against the old broken code, PASS against the fixed code.
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
// Helpers (same as lib-image-processing.test.ts)
// ---------------------------------------------------------------------------

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

async function decodeOutput(output: Record<string, unknown>) {
  const data = output.data as string;
  const buf = Buffer.from(data, "base64");
  const { data: raw, info } = await sharp(buf)
    .raw()
    .toBuffer({ resolveWithObject: true });
  return { raw, info, buf };
}

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

async function runNode(
  nodes: readonly unknown[],
  suffix: string,
  inputs: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const Cls = findNode(nodes as never, suffix);
  const node = new Cls();
  node.assign(inputs);
  const result = await node.process();
  return (result.output ?? result) as Record<string, unknown>;
}

function assertValidImage(output: Record<string, unknown>) {
  expect(output).toBeDefined();
  expect(typeof output.data).toBe("string");
  expect((output.data as string).length).toBeGreaterThan(0);
}

/** Compare two image outputs and return true if their raw pixels differ. */
async function pixelsDiffer(
  a: Record<string, unknown>,
  b: Record<string, unknown>
): Promise<boolean> {
  const aBuf = Buffer.from(a.data as string, "base64");
  const bBuf = Buffer.from(b.data as string, "base64");
  const { data: aRaw } = await sharp(aBuf).raw().toBuffer({ resolveWithObject: true });
  const { data: bRaw } = await sharp(bBuf).raw().toBuffer({ resolveWithObject: true });
  const len = Math.min(aRaw.length, bRaw.length);
  for (let i = 0; i < len; i++) {
    if (aRaw[i] !== bRaw[i]) return true;
  }
  return false;
}

// ===========================================================================
// 1. RenderText — old impl ignored x, y, size, color, font, align inputs
// ===========================================================================

describe("regression: RenderText inputs are respected", () => {
  it("x and y position affect the output", async () => {
    const img = await makeTestImage(64, 64, 0, 0, 0);
    const outputA = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "X",
      x: 0,
      y: 0,
      size: 20,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    const outputB = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "X",
      x: 50,
      y: 50,
      size: 20,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    assertValidImage(outputA);
    assertValidImage(outputB);
    // Different positions must produce different pixel output
    expect(await pixelsDiffer(outputA, outputB)).toBe(true);
  });

  it("size affects the output", async () => {
    const img = await makeTestImage(64, 64, 0, 0, 0);
    const outputSmall = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "Hello",
      x: 5,
      y: 5,
      size: 10,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    const outputLarge = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "Hello",
      x: 5,
      y: 5,
      size: 24,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    assertValidImage(outputSmall);
    assertValidImage(outputLarge);
    expect(await pixelsDiffer(outputSmall, outputLarge)).toBe(true);
  });

  it("color affects the output", async () => {
    const img = await makeTestImage(64, 64, 0, 0, 0);
    const outputWhite = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "Hello",
      x: 5,
      y: 5,
      size: 16,
      color: { type: "color", value: "#FFFFFF" },
      align: "left"
    });
    const outputRed = await runNode(LIB_IMAGE_DRAW_NODES, ".RenderText", {
      image: img,
      text: "Hello",
      x: 5,
      y: 5,
      size: 16,
      color: { type: "color", value: "#FF0000" },
      align: "left"
    });
    assertValidImage(outputWhite);
    assertValidImage(outputRed);
    expect(await pixelsDiffer(outputWhite, outputRed)).toBe(true);
  });
});

// ===========================================================================
// 2. GaussianNoise — old required input image, ignored mean/stddev
// ===========================================================================

describe("regression: GaussianNoise generates without input image", () => {
  it("creates a valid image without any input image", async () => {
    const output = await runNode(LIB_IMAGE_DRAW_NODES, ".GaussianNoise", {
      mean: 0,
      stddev: 1,
      width: 32,
      height: 32
    });
    assertValidImage(output);
    // Verify dimensions match requested size
    const { info } = await decodeOutput(output);
    expect(info.width).toBe(32);
    expect(info.height).toBe(32);
  });

  it("mean and stddev affect the output pixel distribution", async () => {
    // With mean=0, stddev=0.1 pixels should cluster near 128
    const narrowOutput = await runNode(LIB_IMAGE_DRAW_NODES, ".GaussianNoise", {
      mean: 0,
      stddev: 0.1,
      width: 64,
      height: 64
    });
    // With mean=0, stddev=2 pixels should spread widely
    const wideOutput = await runNode(LIB_IMAGE_DRAW_NODES, ".GaussianNoise", {
      mean: 0,
      stddev: 2,
      width: 64,
      height: 64
    });
    assertValidImage(narrowOutput);
    assertValidImage(wideOutput);

    // Compute variance of the narrow output — should be much smaller
    const { raw: narrowRaw } = await decodeOutput(narrowOutput);
    const { raw: wideRaw } = await decodeOutput(wideOutput);

    function computeVariance(buf: Buffer): number {
      let sum = 0;
      let sumSq = 0;
      for (let i = 0; i < buf.length; i++) {
        sum += buf[i];
        sumSq += buf[i] * buf[i];
      }
      const mean = sum / buf.length;
      return sumSq / buf.length - mean * mean;
    }

    const narrowVar = computeVariance(narrowRaw);
    const wideVar = computeVariance(wideRaw);
    // Wide stddev should produce much higher variance
    expect(wideVar).toBeGreaterThan(narrowVar * 2);
  });

  it("pixel distribution is roughly Gaussian (mean clusters near expected value)", async () => {
    // mean=0.5 should produce pixels centered around 128 + 0.5*128 = 192
    const output = await runNode(LIB_IMAGE_DRAW_NODES, ".GaussianNoise", {
      mean: 0.5,
      stddev: 0.3,
      width: 64,
      height: 64
    });
    assertValidImage(output);
    const { raw } = await decodeOutput(output);
    let sum = 0;
    for (let i = 0; i < raw.length; i++) {
      sum += raw[i];
    }
    const avgPixel = sum / raw.length;
    // Expected center: 128 + 0.5*128 = 192
    // Allow generous range but must NOT be around 128 (which would mean mean is ignored)
    expect(avgPixel).toBeGreaterThan(150);
    expect(avgPixel).toBeLessThan(230);
  });
});

// ===========================================================================
// 3. Canny — old impl was identical to FindEdges (just a convolution)
// ===========================================================================

describe("regression: Canny differs from FindEdges", () => {
  it("produces different output from FindEdges on the same input", async () => {
    const img = await makeGradientImage(32, 32);
    const cannyOutput = await runNode(LIB_IMAGE_FILTER_NODES, ".Canny", {
      image: img,
      low_threshold: 100,
      high_threshold: 200
    });
    const findEdgesOutput = await runNode(LIB_IMAGE_FILTER_NODES, ".FindEdges", {
      image: img
    });
    assertValidImage(cannyOutput);
    assertValidImage(findEdgesOutput);
    // Must differ — old impl produced identical output
    expect(await pixelsDiffer(cannyOutput, findEdgesOutput)).toBe(true);
  });

  it("low_threshold and high_threshold affect the output", async () => {
    const img = await makeGradientImage(32, 32);
    const outputLow = await runNode(LIB_IMAGE_FILTER_NODES, ".Canny", {
      image: img,
      low_threshold: 10,
      high_threshold: 30
    });
    const outputHigh = await runNode(LIB_IMAGE_FILTER_NODES, ".Canny", {
      image: img,
      low_threshold: 200,
      high_threshold: 250
    });
    assertValidImage(outputLow);
    assertValidImage(outputHigh);
    expect(await pixelsDiffer(outputLow, outputHigh)).toBe(true);
  });
});

// ===========================================================================
// 4. Contour — old impl was identical to FindEdges
// ===========================================================================

describe("regression: Contour differs from FindEdges", () => {
  it("produces different output from FindEdges on the same input", async () => {
    const img = await makeGradientImage(32, 32);
    const contourOutput = await runNode(LIB_IMAGE_FILTER_NODES, ".Contour", {
      image: img
    });
    const findEdgesOutput = await runNode(LIB_IMAGE_FILTER_NODES, ".FindEdges", {
      image: img
    });
    assertValidImage(contourOutput);
    assertValidImage(findEdgesOutput);
    // Must differ — old impl used same kernel [-1,-1,-1,-1,8,-1,-1,-1,-1]
    expect(await pixelsDiffer(contourOutput, findEdgesOutput)).toBe(true);
  });
});

// ===========================================================================
// 5. Smooth — old used median filter, should use convolution [1,1,1,1,5,1,1,1,1]/13
// ===========================================================================

describe("regression: Smooth uses convolution (weighted average), not median", () => {
  it("produces a weighted average, not a median", async () => {
    // Create a test image with a single bright pixel surrounded by dark ones.
    // Convolution (weighted avg) will spread the bright pixel to neighbors.
    // Median filter would remove the bright pixel entirely.
    const w = 8;
    const h = 8;
    const pixels = Buffer.alloc(w * h * 3);
    // All zeros except center pixel is bright white
    pixels[(4 * w + 4) * 3] = 255;
    pixels[(4 * w + 4) * 3 + 1] = 255;
    pixels[(4 * w + 4) * 3 + 2] = 255;
    const buf = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();
    const img = { type: "image", data: buf.toString("base64"), uri: "" };

    const output = await runNode(LIB_IMAGE_FILTER_NODES, ".Smooth", {
      image: img
    });
    assertValidImage(output);
    const { raw } = await decodeOutput(output);

    // With convolution kernel [1,1,1,1,5,1,1,1,1]/13:
    // Center pixel (4,4) should be 255*5/13 ~ 98
    // Neighbor pixels should be 255*1/13 ~ 20
    // With median filter: center pixel would become 0 (most neighbors are 0)
    const centerR = raw[(4 * w + 4) * 3];
    // Center should retain significant brightness (weighted avg preserves it partially)
    expect(centerR).toBeGreaterThan(50);
    // But should be reduced from original 255 (it's averaged)
    expect(centerR).toBeLessThan(200);

    // Neighbors should also have some brightness (convolution spreads energy)
    const neighborR = raw[(4 * w + 5) * 3]; // pixel to the right
    expect(neighborR).toBeGreaterThan(5);
  });
});

// ===========================================================================
// 6. AutoContrast — old ignored cutoff parameter
// ===========================================================================

describe("regression: AutoContrast cutoff affects output", () => {
  it("cutoff=0 and cutoff=10 produce different outputs", async () => {
    const img = await makeGradientImage(16, 16);
    const outputNoCutoff = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AutoContrast", {
      image: img,
      cutoff: 0
    });
    const outputWithCutoff = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AutoContrast", {
      image: img,
      cutoff: 10
    });
    assertValidImage(outputNoCutoff);
    assertValidImage(outputWithCutoff);
    // Must differ — old impl used sharp.normalize() which ignores cutoff
    expect(await pixelsDiffer(outputNoCutoff, outputWithCutoff)).toBe(true);
  });
});

// ===========================================================================
// 7. Equalize — old used same sharp.normalize() as AutoContrast
// ===========================================================================

describe("regression: Equalize differs from AutoContrast", () => {
  it("produces different output from AutoContrast on the same input", async () => {
    const img = await makeGradientImage(16, 16);
    const equalizeOutput = await runNode(LIB_IMAGE_ENHANCE_NODES, ".Equalize", {
      image: img
    });
    const autoContrastOutput = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AutoContrast", {
      image: img,
      cutoff: 0
    });
    assertValidImage(equalizeOutput);
    assertValidImage(autoContrastOutput);
    // Must differ — old impl used sharp.normalize() for both
    expect(await pixelsDiffer(equalizeOutput, autoContrastOutput)).toBe(true);
  });
});

// ===========================================================================
// 8. RankFilter — old ignored rank parameter
// ===========================================================================

describe("regression: RankFilter rank affects output", () => {
  it("rank=0 (min filter) and rank=size*size-1 (max filter) produce different outputs", async () => {
    const img = await makeGradientImage(16, 16);
    const size = 3;
    const outputMin = await runNode(LIB_IMAGE_ENHANCE_NODES, ".RankFilter", {
      image: img,
      size,
      rank: 0
    });
    const outputMax = await runNode(LIB_IMAGE_ENHANCE_NODES, ".RankFilter", {
      image: img,
      size,
      rank: size * size - 1
    });
    assertValidImage(outputMin);
    assertValidImage(outputMax);
    // Must differ — old impl used sharp.median() ignoring rank
    expect(await pixelsDiffer(outputMin, outputMax)).toBe(true);

    // Min filter should produce darker pixels, max filter should produce brighter
    const { raw: minRaw } = await decodeOutput(outputMin);
    const { raw: maxRaw } = await decodeOutput(outputMax);
    let minSum = 0;
    let maxSum = 0;
    for (let i = 0; i < minRaw.length; i++) {
      minSum += minRaw[i];
      maxSum += maxRaw[i];
    }
    expect(maxSum).toBeGreaterThan(minSum);
  });
});

// ===========================================================================
// 9. AdaptiveContrast (CLAHE) — old ignored clip_limit and grid_size
// ===========================================================================

describe("regression: AdaptiveContrast clip_limit and grid_size affect output", () => {
  it("different clip_limit values produce different outputs", async () => {
    // Use a larger image with more tonal variation so CLAHE tiles have enough data
    const w = 64;
    const h = 64;
    const pixels = Buffer.alloc(w * h * 3);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 3;
        pixels[i] = Math.floor((x / w) * 255);
        pixels[i + 1] = Math.floor((y / h) * 255);
        pixels[i + 2] = Math.floor(((x + y) / (w + h)) * 255);
      }
    }
    const buf = await sharp(pixels, { raw: { width: w, height: h, channels: 3 } })
      .png()
      .toBuffer();
    const img = { type: "image", data: buf.toString("base64"), uri: "" };

    const outputLow = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AdaptiveContrast", {
      image: img,
      clip_limit: 1,
      grid_size: 4
    });
    const outputHigh = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AdaptiveContrast", {
      image: img,
      clip_limit: 40,
      grid_size: 4
    });
    assertValidImage(outputLow);
    assertValidImage(outputHigh);
    expect(await pixelsDiffer(outputLow, outputHigh)).toBe(true);
  });

  it("different grid_size values produce different outputs", async () => {
    const img = await makeGradientImage(32, 32);
    const outputSmall = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AdaptiveContrast", {
      image: img,
      clip_limit: 2,
      grid_size: 2
    });
    const outputLarge = await runNode(LIB_IMAGE_ENHANCE_NODES, ".AdaptiveContrast", {
      image: img,
      clip_limit: 2,
      grid_size: 8
    });
    assertValidImage(outputSmall);
    assertValidImage(outputLarge);
    expect(await pixelsDiffer(outputSmall, outputLarge)).toBe(true);
  });
});

// ===========================================================================
// 10. LiftGammaGain — old applied wrong order: (input*gain+lift)^gamma
//     Correct order: ((input + lift) * gain) ^ gamma
// ===========================================================================

describe("regression: LiftGammaGain applies correct operation order", () => {
  it("lift=0.1 gain=1.5 produces (pixel+lift)*gain, not pixel*gain+lift", async () => {
    // Use a known mid-gray pixel (128/255 ~ 0.502)
    const img = await makeTestImage(4, 4, 128, 128, 128);
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".LiftGammaGain", {
      image: img,
      lift_r: 0.1,
      lift_g: 0,
      lift_b: 0,
      lift_master: 0,
      gamma_r: 1,
      gamma_g: 1,
      gamma_b: 1,
      gamma_master: 1,
      gain_r: 1.5,
      gain_g: 1,
      gain_b: 1,
      gain_master: 1
    });
    assertValidImage(output);
    const { raw } = await decodeOutput(output);

    // Input pixel R = 128/255 ~ 0.502 in float
    // Correct: (0.502 + 0.1) * 1.5 = 0.903 -> ~230
    // Wrong:   (0.502 * 1.5) + 0.1 = 0.853 -> ~218
    const outR = raw[0];
    // Correct order gives a higher value
    // The result should be above 225 (correct) not around 218 (wrong)
    expect(outR).toBeGreaterThanOrEqual(225);
  });
});

// ===========================================================================
// 11. FilmLook — old NOIR preset had saturation=0.0, should be ~0.3
// ===========================================================================

describe("regression: FilmLook NOIR preset has saturation ~0.3", () => {
  it("NOIR preset retains some color (saturation 0.3), not fully desaturated", async () => {
    // Use a colorful image with strong color separation
    const img = await makeTestImage(16, 16, 200, 50, 50);
    const output = await runNode(LIB_IMAGE_COLOR_GRADING_NODES, ".FilmLook", {
      image: img,
      preset: "noir",
      intensity: 1
    });
    assertValidImage(output);
    const { raw } = await decodeOutput(output);

    // With saturation=0.3, some color difference should remain between R and G/B
    // With saturation=0.0, R, G, B would all equal the luminance (grayscale)
    // Sample a few pixels and check R != G or R != B
    let hasColorDifference = false;
    for (let i = 0; i < raw.length - 2; i += 3) {
      const r = raw[i];
      const g = raw[i + 1];
      const b = raw[i + 2];
      // Check if there's meaningful color separation (not grayscale)
      if (Math.abs(r - g) > 3 || Math.abs(r - b) > 3) {
        hasColorDifference = true;
        break;
      }
    }
    // With saturation=0.3, some color should remain
    expect(hasColorDifference).toBe(true);
  });
});

// ===========================================================================
// 12. Expand — old read wrong property name for fill
// ===========================================================================

describe("regression: Expand fill input is actually used", () => {
  it("fill=0 and fill=255 produce different border colors", async () => {
    const img = await makeTestImage(4, 4, 128, 128, 128);
    const outputBlack = await runNode(LIB_IMAGE_FILTER_NODES, ".Expand", {
      image: img,
      border: 4,
      fill: 0
    });
    const outputWhite = await runNode(LIB_IMAGE_FILTER_NODES, ".Expand", {
      image: img,
      border: 4,
      fill: 255
    });
    assertValidImage(outputBlack);
    assertValidImage(outputWhite);
    expect(await pixelsDiffer(outputBlack, outputWhite)).toBe(true);

    // Verify the border pixel values directly
    const { raw: blackRaw, info: blackInfo } = await decodeOutput(outputBlack);
    const { raw: whiteRaw, info: whiteInfo } = await decodeOutput(outputWhite);
    // Top-left corner (0,0) is in the border area
    // With fill=0 it should be dark, with fill=255 it should be bright
    // Channels may be 3 or 4 (RGB or RGBA)
    const ch = blackInfo.channels;
    const blackCornerR = blackRaw[0];
    const whiteCornerR = whiteRaw[0];
    expect(blackCornerR).toBeLessThan(10);
    expect(whiteCornerR).toBeGreaterThan(245);
  });
});
