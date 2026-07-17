import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import { filtersConvolve3x3V1 } from "@nodetool-ai/gpu/pool";
import { pickImage } from "./lib-image-utils.js";
import { runShaderNode } from "./lib-shader-utils.js";
import { decodeRgba, rawRgbaImageRef } from "./image-io.js";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  inlineFields: string[];
  inputFields:  string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

function createEnhanceNode(desc: Desc): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly inlineFields = desc.inlineFields;
    static readonly inputFields  = desc.inputFields;
    static readonly metadataOutputTypes = desc.outputs;

    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const t = desc.nodeType;
      const props = this.serialize();

      const baseObj = pickImage(this.serialize(), props);

      // GPU-backed path: PIL DETAIL / EDGE_ENHANCE 3×3 convolution kernels.
      // Samples `baseObj` directly (borrows an upstream GPU texture) and emits
      // a texture/RGBA ImageRef. The remaining ops run in JS for histogram /
      // per-tile / sorted-neighbourhood work the shader catalog doesn't cover
      // (AutoContrast, Equalize, AdaptiveContrast, RankFilter).
      if (t.endsWith(".Detail") || t.endsWith(".EdgeEnhance")) {
        // PIL `ImageFilter.DETAIL`: 3×3 [0 -1 0 / -1 10 -1 / 0 -1 0] / 6,
        // and `EDGE_ENHANCE`: same kernel family, slightly weaker.
        const isDetail = t.endsWith(".Detail");
        return {
          output: await runShaderNode(
            filtersConvolve3x3V1,
            isDetail
              ? {
                  row0: d.vec4f(0, -1, 0, 0),
                  row1: d.vec4f(-1, 10, -1, 0),
                  row2: d.vec4f(0, -1, 0, 6)
                }
              : {
                  row0: d.vec4f(-1, -1, -1, 0),
                  row1: d.vec4f(-1, 10, -1, 0),
                  row2: d.vec4f(-1, -1, -1, 2)
                },
            baseObj,
            {},
            context
          )
        };
      }

      // Histogram / neighbourhood ops run in pure JS on the decoded
      // straight-alpha RGBA (4-channel) — no sharp, so they work in the browser
      // too. RGB channels (0–2) are processed; alpha (3) is preserved.
      const { rgba, width: w, height: h } = await decodeRgba(baseObj, context);
      if (!w || !h) return { output: baseObj ?? {} };
      const channels = 4;
      const totalPixels = w * h;

      if (t.endsWith(".AutoContrast")) {
        // `rgba` may alias the upstream node's buffer (decodeRgba borrows raw
        // refs by reference), so mutate a copy — never the shared input.
        const out = new Uint8Array(rgba);
        const cutoff = Number((this as any).cutoff ?? 0);
        const cutCount = Math.floor((totalPixels * cutoff) / 100);
        for (let c = 0; c < 3; c++) {
          const hist = new Uint32Array(256);
          for (let i = c; i < out.length; i += channels) hist[out[i]]++;
          let lo = 0;
          let cumLo = 0;
          while (lo < 255 && cumLo + hist[lo] <= cutCount) {
            cumLo += hist[lo];
            lo++;
          }
          let hi = 255;
          let cumHi = 0;
          while (hi > 0 && cumHi + hist[hi] <= cutCount) {
            cumHi += hist[hi];
            hi--;
          }
          if (lo >= hi) continue;
          const scale = 255.0 / (hi - lo);
          for (let i = c; i < out.length; i += channels) {
            out[i] = Math.max(0, Math.min(255, Math.round((out[i] - lo) * scale)));
          }
        }
        return { output: rawRgbaImageRef(out, w, h) };
      }

      if (t.endsWith(".Equalize")) {
        // `rgba` may alias the upstream node's buffer (decodeRgba borrows raw
        // refs by reference), so mutate a copy — never the shared input.
        const out = new Uint8Array(rgba);
        for (let c = 0; c < 3; c++) {
          const hist = new Uint32Array(256);
          for (let i = c; i < out.length; i += channels) hist[out[i]]++;
          const cdf = new Uint32Array(256);
          cdf[0] = hist[0];
          for (let j = 1; j < 256; j++) cdf[j] = cdf[j - 1] + hist[j];
          let cdfMin = 0;
          for (let j = 0; j < 256; j++) {
            if (cdf[j] > 0) {
              cdfMin = cdf[j];
              break;
            }
          }
          const lut = new Uint8Array(256);
          const denom = totalPixels - cdfMin;
          if (denom > 0) {
            for (let j = 0; j < 256; j++) {
              lut[j] = Math.round(((cdf[j] - cdfMin) / denom) * 255);
            }
          }
          for (let i = c; i < out.length; i += channels) out[i] = lut[out[i]];
        }
        return { output: rawRgbaImageRef(out, w, h) };
      }

      if (t.endsWith(".AdaptiveContrast")) {
        const clipLimit = Number((this as any).clip_limit ?? 2);
        const gridSize = Math.max(
          1,
          Math.round(Number((this as any).grid_size ?? 8))
        );
        const tileW = Math.ceil(w / gridSize);
        const tileH = Math.ceil(h / gridSize);
        const tileCDFs: Float32Array[][][] = [];
        for (let ty = 0; ty < gridSize; ty++) {
          tileCDFs[ty] = [];
          for (let tx = 0; tx < gridSize; tx++) {
            tileCDFs[ty][tx] = [];
            const x0 = tx * tileW;
            const y0 = ty * tileH;
            const x1 = Math.min(x0 + tileW, w);
            const y1 = Math.min(y0 + tileH, h);
            const tilePixels = (x1 - x0) * (y1 - y0);
            for (let c = 0; c < 3; c++) {
              const hist = new Uint32Array(256);
              for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                  hist[rgba[(y * w + x) * channels + c]]++;
                }
              }
              const limit = Math.max(
                1,
                Math.round((clipLimit * tilePixels) / 256)
              );
              let excess = 0;
              for (let j = 0; j < 256; j++) {
                if (hist[j] > limit) {
                  excess += hist[j] - limit;
                  hist[j] = limit;
                }
              }
              const increment = Math.floor(excess / 256);
              for (let j = 0; j < 256; j++) hist[j] += increment;
              const cdf = new Float32Array(256);
              cdf[0] = hist[0];
              for (let j = 1; j < 256; j++) cdf[j] = cdf[j - 1] + hist[j];
              const cdfMax = cdf[255];
              if (cdfMax > 0) {
                for (let j = 0; j < 256; j++) cdf[j] = (cdf[j] / cdfMax) * 255;
              }
              tileCDFs[ty][tx][c] = cdf;
            }
          }
        }
        const result = new Uint8Array(rgba); // copy preserves alpha
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const ftx = (x + 0.5) / tileW - 0.5;
            const fty = (y + 0.5) / tileH - 0.5;
            const tx0 = Math.max(0, Math.floor(ftx));
            const ty0 = Math.max(0, Math.floor(fty));
            const tx1 = Math.min(gridSize - 1, tx0 + 1);
            const ty1 = Math.min(gridSize - 1, ty0 + 1);
            const fx = Math.max(0, Math.min(1, ftx - tx0));
            const fy = Math.max(0, Math.min(1, fty - ty0));
            for (let c = 0; c < 3; c++) {
              const val = rgba[(y * w + x) * channels + c];
              const tl = tileCDFs[ty0][tx0][c][val];
              const tr = tileCDFs[ty0][tx1][c][val];
              const bl = tileCDFs[ty1][tx0][c][val];
              const br = tileCDFs[ty1][tx1][c][val];
              const top = tl * (1 - fx) + tr * fx;
              const bot = bl * (1 - fx) + br * fx;
              result[(y * w + x) * channels + c] = Math.round(
                top * (1 - fy) + bot * fy
              );
            }
          }
        }
        return { output: rawRgbaImageRef(result, w, h) };
      }

      if (t.endsWith(".RankFilter")) {
        // Clamp the window size: each pixel allocates and sorts a
        // (2*floor(size/2)+1)^2-element array per channel, so an unbounded size
        // (e.g. 512 → ~262k elements/pixel) would hang the process. 25 matches
        // typical PIL RankFilter usage. `result` is a copy, so `rgba` (which may
        // alias the upstream buffer) is only ever read here, never mutated.
        const size = Math.max(1, Math.min(25, Number((this as any).size ?? 3)));
        const rank = Number((this as any).rank ?? 3);
        const half = Math.floor(size / 2);
        const result = new Uint8Array(rgba); // copy preserves alpha
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            for (let c = 0; c < 3; c++) {
              const neighbors: number[] = [];
              for (let ky = -half; ky <= half; ky++) {
                for (let kx = -half; kx <= half; kx++) {
                  const ny = Math.min(h - 1, Math.max(0, y + ky));
                  const nx = Math.min(w - 1, Math.max(0, x + kx));
                  neighbors.push(rgba[(ny * w + nx) * channels + c]);
                }
              }
              neighbors.sort((a, b) => a - b);
              const idx = Math.min(rank, neighbors.length - 1);
              result[(y * w + x) * channels + c] = neighbors[idx];
            }
          }
        }
        return { output: rawRgbaImageRef(result, w, h) };
      }

      // Unknown enhance type — pass the source through unchanged.
      return { output: rawRgbaImageRef(rgba, w, h) };
    }
  };

  for (const property of desc.properties) {
    registerDeclaredProperty(C, property.name, property.options);
  }

  return C as NodeClass;
}

const DESCRIPTORS: readonly Desc[] = [
  {
    nodeType: "lib.image.enhance.AdaptiveContrast",
    title: "Adaptive Contrast",
    description:
      "Applies localized contrast enhancement using adaptive techniques.\n    image, contrast, enhance\n\n    Use cases:\n    - Improve visibility in images with varying lighting conditions\n    - Prepare images for improved feature detection in computer vision",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust the contrast for."
        }
      },
      {
        name: "clip_limit",
        options: {
          type: "float",
          default: 2,
          title: "Clip Limit",
          description: "Clip limit for adaptive contrast.",
          min: 0,
          max: 100
        }
      },
      {
        name: "grid_size",
        options: {
          type: "int",
          default: 8,
          title: "Grid Size",
          description: "Grid size for adaptive contrast.",
          min: 1,
          max: 64
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.AutoContrast",
    title: "Auto Contrast",
    description:
      "Automatically adjusts image contrast for enhanced visual quality.\n    image, contrast, balance\n\n    Use cases:\n    - Enhance image clarity for better visual perception\n    - Pre-process images for computer vision tasks\n    - Improve photo aesthetics in editing workflows",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to adjust the contrast for."
        }
      },
      {
        name: "cutoff",
        options: {
          type: "int",
          default: 0,
          title: "Cutoff",
          description:
            "Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range.",
          min: 0,
          max: 49
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Detail",
    title: "Detail",
    description:
      "Enhances fine details in images.\n    image, detail, enhance\n\n    Use cases:\n    - Improve clarity of textural elements in photographs\n    - Enhance visibility of small features for analysis\n    - Prepare images for high-resolution display or printing",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to detail."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.EdgeEnhance",
    title: "Edge Enhance",
    description:
      "Enhances edge visibility by increasing contrast along boundaries.\n    image, edge, enhance\n\n    Use cases:\n    - Improve object boundary detection for computer vision\n    - Highlight structural elements in technical drawings\n    - Prepare images for feature extraction in image analysis",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to edge enhance."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Equalize",
    title: "Equalize",
    description:
      "Enhances image contrast by equalizing intensity distribution.\n    image, contrast, histogram\n\n    Use cases:\n    - Improve visibility in poorly lit images\n    - Enhance details for image analysis tasks\n    - Normalize image data for machine learning",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to equalize."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.RankFilter",
    title: "Rank Filter",
    description:
      "Applies rank-based filtering to enhance or smooth image features.\n    image, filter, enhance\n\n    Use cases:\n    - Reduce noise while preserving edges in images\n    - Enhance specific image features based on local intensity\n    - Pre-process images for improved segmentation results",
    inlineFields: [],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image",
          description: "The image to rank filter."
        }
      },
      {
        name: "size",
        options: {
          type: "int",
          default: 3,
          title: "Size",
          description:
            "Rank filter window size (odd values recommended; the effective window is (2*floor(size/2)+1)^2, so an even size behaves like the next odd size up). Clamped to 25 at runtime to bound per-pixel sort cost.",
          min: 1,
          max: 25
        }
      },
      {
        name: "rank",
        options: {
          type: "int",
          default: 3,
          title: "Rank",
          description:
            "Index into the sorted neighbourhood (0 = minimum, size*size-1 = maximum).",
          min: 0,
          max: 512
        }
      }
    ]
  }
];

export const LIB_IMAGE_ENHANCE_NODES: NodeClass[] = tagAsBrowserGpu(
  tagAsContentCard(DESCRIPTORS.map(createEnhanceNode))
);
