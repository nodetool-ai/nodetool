import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import sharp from "sharp";
import * as d from "typegpu/data";
import {
  colorInvertV1,
  colorPosterizeV1,
  colorGrayscaleV1,
  colorSolarizeV1,
  filtersConvolve3x3V1
} from "@nodetool-ai/gpu/pool";
import { decodeImage, toRef, pickImage } from "./lib-image-utils.js";
import { runShaderOnPngBuffer } from "./lib-shader-utils.js";
import { tagAsHybrid } from "../platform-tags.js";

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  inlineFields: string[];
  inputFields:  string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

function createFilterNode(desc: Desc): NodeClass {
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

      const baseObj = pickImage(this.serialize(), this.serialize());
      const baseBytes = await decodeImage(baseObj, context);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      // GPU-backed paths first — see lib-image-enhance.ts for the same
      // pattern. Sharp stays for `Canny` (multi-stage with hysteresis) and
      // `Expand` (sharp's `extend` adds an out-of-canvas border with a
      // background colour — not a pixel op).
      if (t.endsWith(".Solarize")) {
        const threshold = Number((this as any).threshold ?? 128) / 255;
        const png = await runShaderOnPngBuffer(
          colorSolarizeV1,
          { threshold },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".Posterize")) {
        const bits = Math.max(
          1,
          Math.min(8, Math.round(Number((this as any).bits ?? 4)))
        );
        const png = await runShaderOnPngBuffer(
          colorPosterizeV1,
          { levels: Math.pow(2, bits) },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".Invert")) {
        const png = await runShaderOnPngBuffer(
          colorInvertV1,
          { amount: 1 },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".ConvertToGrayscale")) {
        const png = await runShaderOnPngBuffer(
          colorGrayscaleV1,
          { amount: 1 },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".Emboss")) {
        // PIL `ImageFilter.EMBOSS` kernel: [-1 0 0 / 0 1 0 / 0 0 0] + 128.
        const png = await runShaderOnPngBuffer(
          filtersConvolve3x3V1,
          {
            row0: d.vec4f(-1, 0, 0, 128 / 255),
            row1: d.vec4f(0, 1, 0, 0),
            row2: d.vec4f(0, 0, 0, 1)
          },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".FindEdges")) {
        const png = await runShaderOnPngBuffer(
          filtersConvolve3x3V1,
          {
            row0: d.vec4f(-1, -1, -1, 0),
            row1: d.vec4f(-1, 8, -1, 0),
            row2: d.vec4f(-1, -1, -1, 1)
          },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".Contour")) {
        // Composite Prewitt-style edge detector. PIL's CONTOUR is a single
        // 3×3 kernel; this approximates it with a centre-weighted Laplacian
        // followed by inversion to give a white-background contour image.
        const png = await runShaderOnPngBuffer(
          filtersConvolve3x3V1,
          {
            row0: d.vec4f(-1, -1, -1, 1),
            row1: d.vec4f(-1, 9, -1, -1),
            row2: d.vec4f(-1, -1, -1, 1)
          },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }
      if (t.endsWith(".Smooth")) {
        // PIL SMOOTH kernel: [1,1,1, 1,5,1, 1,1,1] with scale=13.
        const png = await runShaderOnPngBuffer(
          filtersConvolve3x3V1,
          {
            row0: d.vec4f(1, 1, 1, 0),
            row1: d.vec4f(1, 5, 1, 0),
            row2: d.vec4f(1, 1, 1, 13)
          },
          new Uint8Array(baseBytes),
          {},
          context
        );
        return { output: toRef(Buffer.from(png), baseObj) };
      }

      // Sharp-only paths follow — multi-stage algorithms not yet covered
      // by the shader catalog.
      let img = sharp(baseBytes, { failOn: "none" });

      if (t.endsWith(".Canny")) {
        // Proper Canny edge detection
        const lowThreshold = Number((this as any).low_threshold ?? 100);
        const highThreshold = Number((this as any).high_threshold ?? 200);
        // Convert to grayscale
        const grayImg = sharp(baseBytes, { failOn: "none" }).grayscale();
        const { data: grayData, info: grayInfo } = await grayImg
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = grayInfo.width;
        const h = grayInfo.height;
        // Apply Gaussian blur (sigma=1.4, kernel size=5)
        const blurred = new Float32Array(w * h);
        const gaussKernel = [
          0.0029, 0.0131, 0.0215, 0.0131, 0.0029, 0.0131, 0.0586, 0.0965,
          0.0586, 0.0131, 0.0215, 0.0965, 0.1592, 0.0965, 0.0215, 0.0131,
          0.0586, 0.0965, 0.0586, 0.0131, 0.0029, 0.0131, 0.0215, 0.0131,
          0.0029
        ];
        for (let y = 2; y < h - 2; y++) {
          for (let x = 2; x < w - 2; x++) {
            let sum = 0;
            for (let ky = -2; ky <= 2; ky++) {
              for (let kx = -2; kx <= 2; kx++) {
                sum +=
                  grayData[(y + ky) * w + (x + kx)] *
                  gaussKernel[(ky + 2) * 5 + (kx + 2)];
              }
            }
            blurred[y * w + x] = sum;
          }
        }
        // Sobel gradients
        const gradMag = new Float32Array(w * h);
        const gradDir = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const gx =
              -blurred[(y - 1) * w + (x - 1)] +
              blurred[(y - 1) * w + (x + 1)] -
              2 * blurred[y * w + (x - 1)] +
              2 * blurred[y * w + (x + 1)] -
              blurred[(y + 1) * w + (x - 1)] +
              blurred[(y + 1) * w + (x + 1)];
            const gy =
              -blurred[(y - 1) * w + (x - 1)] -
              2 * blurred[(y - 1) * w + x] -
              blurred[(y - 1) * w + (x + 1)] +
              blurred[(y + 1) * w + (x - 1)] +
              2 * blurred[(y + 1) * w + x] +
              blurred[(y + 1) * w + (x + 1)];
            gradMag[y * w + x] = Math.sqrt(gx * gx + gy * gy);
            gradDir[y * w + x] = Math.atan2(gy, gx);
          }
        }
        // Non-maximum suppression
        const nms = new Float32Array(w * h);
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const angle =
              ((gradDir[y * w + x] * 180) / Math.PI + 180) % 180;
            const mag = gradMag[y * w + x];
            let n1: number,
              n2: number;
            if (angle < 22.5 || angle >= 157.5) {
              n1 = gradMag[y * w + (x - 1)];
              n2 = gradMag[y * w + (x + 1)];
            } else if (angle < 67.5) {
              n1 = gradMag[(y - 1) * w + (x + 1)];
              n2 = gradMag[(y + 1) * w + (x - 1)];
            } else if (angle < 112.5) {
              n1 = gradMag[(y - 1) * w + x];
              n2 = gradMag[(y + 1) * w + x];
            } else {
              n1 = gradMag[(y - 1) * w + (x - 1)];
              n2 = gradMag[(y + 1) * w + (x + 1)];
            }
            nms[y * w + x] = mag >= n1 && mag >= n2 ? mag : 0;
          }
        }
        // Hysteresis thresholding
        const result = Buffer.alloc(w * h);
        const STRONG = 255;
        const WEAK = 128;
        for (let y = 1; y < h - 1; y++) {
          for (let x = 1; x < w - 1; x++) {
            const v = nms[y * w + x];
            if (v >= highThreshold) result[y * w + x] = STRONG;
            else if (v >= lowThreshold) result[y * w + x] = WEAK;
          }
        }
        // Connect weak edges to strong edges
        let changed = true;
        while (changed) {
          changed = false;
          for (let y = 1; y < h - 1; y++) {
            for (let x = 1; x < w - 1; x++) {
              if (result[y * w + x] === WEAK) {
                let hasStrong = false;
                for (let dy = -1; dy <= 1 && !hasStrong; dy++) {
                  for (let dx = -1; dx <= 1 && !hasStrong; dx++) {
                    if (result[(y + dy) * w + (x + dx)] === STRONG)
                      hasStrong = true;
                  }
                }
                if (hasStrong) {
                  result[y * w + x] = STRONG;
                  changed = true;
                }
              }
            }
          }
        }
        // Remove remaining weak edges
        for (let i = 0; i < result.length; i++) {
          if (result[i] !== STRONG) result[i] = 0;
        }
        const out = await sharp(result, {
          raw: { width: w, height: h, channels: 1 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      } else if (t.endsWith(".Expand")) {
        const border = Number((this as any).border ?? 10);
        const fillVal = Number((this as any).fill ?? 0);
        const color = `rgb(${fillVal},${fillVal},${fillVal})`;
        img = img.extend({
          top: border,
          left: border,
          right: border,
          bottom: border,
          background: color
        });
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
    nodeType: "lib.image.filter.Canny",
    title: "Canny",
    description:
      "Apply Canny edge detection to an image.\n    image, filter, edges\n\n    - Highlight areas of rapid intensity change\n    - Outline object boundaries and structure\n    - Enhance inputs for object detection and image segmentation",
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
          description: "The image to canny."
        }
      },
      {
        name: "low_threshold",
        options: {
          type: "int",
          default: 100,
          title: "Low Threshold",
          description: "Low threshold.",
          min: 0,
          max: 255
        }
      },
      {
        name: "high_threshold",
        options: {
          type: "int",
          default: 200,
          title: "High Threshold",
          description: "High threshold.",
          min: 0,
          max: 255
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Contour",
    title: "Contour",
    description:
      "Apply a contour filter to highlight image edges.\n    image, filter, contour\n\n    - Extract key features from complex images\n    - Aid pattern recognition and object detection\n    - Create stylized contour sketch art effects",
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
          description: "The image to contour."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.ConvertToGrayscale",
    title: "Convert To Grayscale",
    description:
      "Convert an image to grayscale.\n    image, grayscale\n\n    - Simplify images for feature and edge detection\n    - Prepare images for shape-based machine learning\n    - Create vintage or monochrome aesthetic effects",
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
          description: "The image to convert."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Emboss",
    title: "Emboss",
    description:
      "Apply an emboss filter for a 3D raised effect.\n    image, filter, emboss\n\n    - Add texture and depth to photos\n    - Create visually interesting graphics\n    - Incorporate unique effects in digital artwork",
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
          description: "The image to emboss."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Expand",
    title: "Expand",
    description:
      "Add a border around an image to increase its size.\n    image, border, expand\n\n    - Make images stand out by adding a colored border\n    - Create framed photo effects\n    - Separate image content from surroundings",
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
          description: "The image to expand."
        }
      },
      {
        name: "border",
        options: {
          type: "int",
          default: 0,
          title: "Border",
          description: "Border size.",
          min: 0,
          max: 512
        }
      },
      {
        name: "fill",
        options: {
          type: "int",
          default: 0,
          title: "Fill",
          description: "Fill color.",
          min: 0,
          max: 255
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.FindEdges",
    title: "Find Edges",
    description:
      "Detect and highlight edges in an image.\n    image, filter, edges\n\n    - Analyze structural patterns in images\n    - Aid object detection in computer vision\n    - Detect important features like corners and ridges",
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
          description: "The image to find edges."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Invert",
    title: "Invert",
    description:
      "Invert the colors of an image.\n    image, filter, invert\n\n    - Create negative versions of images for visual effects\n    - Analyze image data by bringing out hidden details\n    - Preprocess images for operations that work better on inverted colors",
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
          description: "The image to adjust the brightness for."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Posterize",
    title: "Posterize",
    description:
      "Reduce the number of colors in an image for a poster-like effect.\n    image, filter, posterize\n\n    - Create graphic art by simplifying image colors\n    - Apply artistic effects to photographs\n    - Generate visually compelling content for advertising",
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
          description: "The image to posterize."
        }
      },
      {
        name: "bits",
        options: {
          type: "int",
          default: 4,
          title: "Bits",
          description: "Number of bits to posterize to.",
          min: 1,
          max: 8
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Smooth",
    title: "Smooth",
    description:
      "Apply smoothing to reduce image noise and detail.\n    image, filter, smooth\n\n    - Enhance visual aesthetics of images\n    - Improve object detection by reducing irrelevant details\n    - Aid facial recognition by simplifying images",
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
          description: "The image to smooth."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Solarize",
    title: "Solarize",
    description:
      "Apply a solarize effect to partially invert image tones.\n    image, filter, solarize\n\n    - Create surreal artistic photo effects\n    - Enhance visual data by making certain elements more prominent\n    - Add a unique style to images for graphic design",
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
          description: "The image to solarize."
        }
      },
      {
        name: "threshold",
        options: {
          type: "int",
          default: 128,
          title: "Threshold",
          description: "Threshold for solarization.",
          min: 0,
          max: 255
        }
      }
    ]
  }
];

export const LIB_IMAGE_FILTER_NODES: readonly NodeClass[] = tagAsHybrid(DESCRIPTORS.map(createFilterNode));
