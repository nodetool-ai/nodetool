import { BaseNode, registerDeclaredProperty } from "@nodetool/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import sharp from "sharp";
import { decodeImage, toRef, pickImage } from "./lib-image-utils.js";

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  basicFields: string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

function createEnhanceNode(desc: Desc): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly basicFields = desc.basicFields;
    static readonly metadataOutputTypes = desc.outputs;

    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const t = desc.nodeType;
      const props = this.serialize();

      const baseObj = pickImage(this.serialize(), props);
      const baseBytes = await decodeImage(baseObj, context);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      let img = sharp(baseBytes, { failOn: "none" });

      if (t.endsWith(".Brightness")) {
        const factor = Number((this as any).factor ?? 1);
        img = img.modulate({ brightness: factor });
      } else if (t.endsWith(".Color")) {
        const factor = Number((this as any).factor ?? 1);
        img = img.modulate({ saturation: factor });
      } else if (t.endsWith(".Contrast")) {
        const factor = Number((this as any).factor ?? 1);
        img = img.linear(factor, -(128 * (factor - 1)));
      } else if (t.endsWith(".Sharpen")) {
        img = img.convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 9, -1, -1, -1, -1]
        });
      } else if (t.endsWith(".Sharpness")) {
        const factor = Number((this as any).factor ?? 1);
        img = img.sharpen({ sigma: 1, m1: Math.max(0, factor), m2: 0.5 });
      } else if (t.endsWith(".UnsharpMask")) {
        const radius = Number((this as any).radius ?? 2);
        const percent = Number((this as any).percent ?? 150);
        const threshold = Number((this as any).threshold ?? 3);
        img = img.sharpen({
          sigma: Math.max(0.5, radius),
          m1: percent / 100,
          m2: threshold
        });
      } else if (t.endsWith(".AutoContrast")) {
        // Proper autocontrast with cutoff
        const cutoff = Number((this as any).cutoff ?? 0);
        const { data: raw, info } = await img
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = info.width;
        const h = info.height;
        const totalPixels = w * h;
        const channels = 3;
        const cutCount = Math.floor((totalPixels * cutoff) / 100);
        for (let c = 0; c < channels; c++) {
          // Build histogram for this channel
          const hist = new Uint32Array(256);
          for (let i = c; i < raw.length; i += channels) {
            hist[raw[i]]++;
          }
          // Find low cutoff
          let lo = 0;
          let cumLo = 0;
          while (lo < 255 && cumLo + hist[lo] <= cutCount) {
            cumLo += hist[lo];
            lo++;
          }
          // Find high cutoff
          let hi = 255;
          let cumHi = 0;
          while (hi > 0 && cumHi + hist[hi] <= cutCount) {
            cumHi += hist[hi];
            hi--;
          }
          if (lo >= hi) continue;
          // Linear map remaining range to 0-255
          const scale = 255.0 / (hi - lo);
          for (let i = c; i < raw.length; i += channels) {
            raw[i] = Math.max(
              0,
              Math.min(255, Math.round((raw[i] - lo) * scale))
            );
          }
        }
        const out = await sharp(raw, {
          raw: { width: w, height: h, channels: channels as 3 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      } else if (t.endsWith(".Equalize")) {
        // Proper histogram equalization
        const { data: raw, info } = await img
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = info.width;
        const h = info.height;
        const totalPixels = w * h;
        const channels = 3;
        for (let c = 0; c < channels; c++) {
          // Build histogram
          const hist = new Uint32Array(256);
          for (let i = c; i < raw.length; i += channels) {
            hist[raw[i]]++;
          }
          // Compute CDF
          const cdf = new Uint32Array(256);
          cdf[0] = hist[0];
          for (let j = 1; j < 256; j++) {
            cdf[j] = cdf[j - 1] + hist[j];
          }
          // Find min non-zero CDF value
          let cdfMin = 0;
          for (let j = 0; j < 256; j++) {
            if (cdf[j] > 0) {
              cdfMin = cdf[j];
              break;
            }
          }
          // Build lookup table
          const lut = new Uint8Array(256);
          const denom = totalPixels - cdfMin;
          if (denom > 0) {
            for (let j = 0; j < 256; j++) {
              lut[j] = Math.round(((cdf[j] - cdfMin) / denom) * 255);
            }
          }
          // Apply LUT
          for (let i = c; i < raw.length; i += channels) {
            raw[i] = lut[raw[i]];
          }
        }
        const out = await sharp(raw, {
          raw: { width: w, height: h, channels: channels as 3 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      } else if (t.endsWith(".AdaptiveContrast")) {
        // CLAHE (Contrast Limited Adaptive Histogram Equalization)
        const clipLimit = Number((this as any).clip_limit ?? 2);
        const gridSize = Math.max(
          1,
          Math.round(Number((this as any).grid_size ?? 8))
        );
        const { data: raw, info } = await img
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = info.width;
        const h = info.height;
        const channels = 3;
        const tileW = Math.ceil(w / gridSize);
        const tileH = Math.ceil(h / gridSize);

        // Build CDFs for each tile and channel
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
            for (let c = 0; c < channels; c++) {
              const hist = new Uint32Array(256);
              for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                  hist[raw[(y * w + x) * channels + c]]++;
                }
              }
              // Clip histogram and redistribute
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
              for (let j = 0; j < 256; j++) {
                hist[j] += increment;
              }
              // Compute CDF
              const cdf = new Float32Array(256);
              cdf[0] = hist[0];
              for (let j = 1; j < 256; j++) {
                cdf[j] = cdf[j - 1] + hist[j];
              }
              // Normalize CDF to 0-255
              const cdfMax = cdf[255];
              if (cdfMax > 0) {
                for (let j = 0; j < 256; j++) {
                  cdf[j] = (cdf[j] / cdfMax) * 255;
                }
              }
              tileCDFs[ty][tx][c] = cdf;
            }
          }
        }

        // Apply with bilinear interpolation between tile CDFs
        const result = Buffer.alloc(raw.length);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            // Find tile coordinates
            const ftx = (x + 0.5) / tileW - 0.5;
            const fty = (y + 0.5) / tileH - 0.5;
            const tx0 = Math.max(0, Math.floor(ftx));
            const ty0 = Math.max(0, Math.floor(fty));
            const tx1 = Math.min(gridSize - 1, tx0 + 1);
            const ty1 = Math.min(gridSize - 1, ty0 + 1);
            const fx = Math.max(0, Math.min(1, ftx - tx0));
            const fy = Math.max(0, Math.min(1, fty - ty0));
            for (let c = 0; c < channels; c++) {
              const val = raw[(y * w + x) * channels + c];
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
        const out = await sharp(result, {
          raw: { width: w, height: h, channels: channels as 3 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      } else if (t.endsWith(".Detail") || t.endsWith(".EdgeEnhance")) {
        img = img.sharpen({ sigma: 0.5, m1: 0.5, m2: 0.3 });
      } else if (t.endsWith(".RankFilter")) {
        // Proper rank filter with configurable rank
        const size = Math.max(1, Number((this as any).size ?? 3));
        const rank = Number((this as any).rank ?? 3);
        const { data: raw, info } = await img
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = info.width;
        const h = info.height;
        const channels = 3;
        const half = Math.floor(size / 2);
        const result = Buffer.alloc(raw.length);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            for (let c = 0; c < channels; c++) {
              const neighbors: number[] = [];
              for (let ky = -half; ky <= half; ky++) {
                for (let kx = -half; kx <= half; kx++) {
                  const ny = Math.min(h - 1, Math.max(0, y + ky));
                  const nx = Math.min(w - 1, Math.max(0, x + kx));
                  neighbors.push(raw[(ny * w + nx) * channels + c]);
                }
              }
              neighbors.sort((a, b) => a - b);
              const idx = Math.min(rank, neighbors.length - 1);
              result[(y * w + x) * channels + c] = neighbors[idx];
            }
          }
        }
        const out = await sharp(result, {
          raw: { width: w, height: h, channels: channels as 3 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      }

      const out = await img.png().toBuffer();
      return { output: toRef(out, baseObj) };
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
    basicFields: ["image", "clip_limit", "grid_size"],
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
    basicFields: ["image", "cutoff"],
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
          max: 255
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Brightness",
    title: "Brightness",
    description:
      "Adjusts overall image brightness to lighten or darken.\n    image, brightness, enhance\n\n    Use cases:\n    - Correct underexposed or overexposed photographs\n    - Enhance visibility of dark image regions\n    - Prepare images for consistent display across devices",
    basicFields: ["image", "factor"],
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
          description: "The image to adjust the brightness for."
        }
      },
      {
        name: "factor",
        options: {
          type: "union[float, int]",
          default: 1,
          title: "Factor",
          description: "Factor to adjust the brightness. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Color",
    title: "Color",
    description:
      "Adjusts color intensity of an image.\n    image, color, enhance\n\n    Use cases:\n    - Enhance color vibrancy in photographs\n    - Correct color imbalances in digital images\n    - Prepare images for consistent brand color representation",
    basicFields: ["image", "factor"],
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
          description: "The image to adjust the brightness for."
        }
      },
      {
        name: "factor",
        options: {
          type: "float",
          default: 1,
          title: "Factor",
          description: "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Contrast",
    title: "Contrast",
    description:
      "Adjusts image contrast to modify light-dark differences.\n    image, contrast, enhance\n\n    Use cases:\n    - Enhance visibility of details in low-contrast images\n    - Prepare images for visual analysis or recognition tasks\n    - Create dramatic effects in artistic photography",
    basicFields: ["image", "factor"],
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
          description: "The image to adjust the brightness for."
        }
      },
      {
        name: "factor",
        options: {
          type: "float",
          default: 1,
          title: "Factor",
          description: "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Detail",
    title: "Detail",
    description:
      "Enhances fine details in images.\n    image, detail, enhance\n\n    Use cases:\n    - Improve clarity of textural elements in photographs\n    - Enhance visibility of small features for analysis\n    - Prepare images for high-resolution display or printing",
    basicFields: ["image"],
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
    basicFields: ["image"],
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
    basicFields: ["image"],
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
    basicFields: ["image", "size", "rank"],
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
          description: "Rank filter size.",
          min: 1,
          max: 512
        }
      },
      {
        name: "rank",
        options: {
          type: "int",
          default: 3,
          title: "Rank",
          description: "Rank filter rank.",
          min: 1,
          max: 512
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Sharpen",
    title: "Sharpen",
    description:
      "Enhances image detail by intensifying local pixel contrast.\n    image, sharpen, clarity\n\n    Use cases:\n    - Improve clarity of photographs for print or display\n    - Refine texture details in product photography\n    - Enhance readability of text in document images",
    basicFields: ["image"],
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
          description: "The image to sharpen."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.Sharpness",
    title: "Sharpness",
    description:
      "Adjusts image sharpness to enhance or reduce detail clarity.\n    image, clarity, sharpness\n\n    Use cases:\n    - Enhance photo details for improved visual appeal\n    - Refine images for object detection tasks\n    - Correct slightly blurred images",
    basicFields: ["image", "factor"],
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
          description: "The image to adjust the brightness for."
        }
      },
      {
        name: "factor",
        options: {
          type: "float",
          default: 1,
          title: "Factor",
          description: "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.enhance.UnsharpMask",
    title: "Unsharp Mask",
    description:
      "Sharpens images using the unsharp mask technique.\n    image, sharpen, enhance\n\n    Use cases:\n    - Enhance edge definition in photographs\n    - Improve perceived sharpness of digital artwork\n    - Prepare images for high-quality printing or display",
    basicFields: ["image", "radius", "percent", "threshold"],
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
          description: "The image to unsharp mask."
        }
      },
      {
        name: "radius",
        options: {
          type: "int",
          default: 2,
          title: "Radius",
          description: "Unsharp mask radius.",
          min: 0,
          max: 512
        }
      },
      {
        name: "percent",
        options: {
          type: "int",
          default: 150,
          title: "Percent",
          description: "Unsharp mask percent.",
          min: 0,
          max: 1000
        }
      },
      {
        name: "threshold",
        options: {
          type: "int",
          default: 3,
          title: "Threshold",
          description: "Unsharp mask threshold.",
          min: 0,
          max: 512
        }
      }
    ]
  }
];

export const LIB_IMAGE_ENHANCE_NODES: NodeClass[] =
  DESCRIPTORS.map(createEnhanceNode);
