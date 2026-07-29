import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import {
  colorInvertV1,
  colorPosterizeV1,
  colorGrayscaleV1,
  colorSolarizeV1,
  filtersConvolve3x3V1,
  transformPadV1
} from "@nodetool-ai/gpu/pool";
import { pickImage } from "./lib-image-utils.js";
import { runShaderNode, type Desc } from "./lib-shader-utils.js";
import { decodeRgba, imageDimensions, rawRgbaImageRef } from "./image-io.js";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";

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

      // GPU-backed paths first — each samples `baseObj` directly so a GPU
      // texture from an upstream node is borrowed (no PNG round-trip) and the
      // output stays a texture/RGBA ImageRef for the next filter. `Canny` runs
      // a multi-stage CPU pass; `Expand` borders the canvas via transform.pad.
      if (t.endsWith(".Solarize")) {
        const threshold = Number((this as any).threshold ?? 128) / 255;
        return {
          output: await runShaderNode(
            colorSolarizeV1,
            { threshold },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".Posterize")) {
        const bits = Math.max(
          1,
          Math.min(8, Math.round(Number((this as any).bits ?? 4)))
        );
        return {
          output: await runShaderNode(
            colorPosterizeV1,
            { levels: Math.pow(2, bits) },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".Invert")) {
        return {
          output: await runShaderNode(
            colorInvertV1,
            { amount: 1 },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".ConvertToGrayscale")) {
        return {
          output: await runShaderNode(
            colorGrayscaleV1,
            { amount: 1 },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".Emboss")) {
        // PIL `ImageFilter.EMBOSS` kernel: [-1 0 0 / 0 1 0 / 0 0 0] + 128.
        return {
          output: await runShaderNode(
            filtersConvolve3x3V1,
            {
              row0: d.vec4f(-1, 0, 0, 128 / 255),
              row1: d.vec4f(0, 1, 0, 0),
              row2: d.vec4f(0, 0, 0, 1)
            },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".FindEdges")) {
        return {
          output: await runShaderNode(
            filtersConvolve3x3V1,
            {
              row0: d.vec4f(-1, -1, -1, 0),
              row1: d.vec4f(-1, 8, -1, 0),
              row2: d.vec4f(-1, -1, -1, 1)
            },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".Contour")) {
        // PIL CONTOUR: Laplacian kernel [-1×8, centre 8] (sum 0) with a
        // full-white offset (255/255). Flat regions cancel to 0 → white
        // background; edges survive as dark contour lines. A centre weight
        // of 9 (sum 1) would sharpen and then blow out to white.
        return {
          output: await runShaderNode(
            filtersConvolve3x3V1,
            {
              row0: d.vec4f(-1, -1, -1, 1),
              row1: d.vec4f(-1, 8, -1, 0),
              row2: d.vec4f(-1, -1, -1, 1)
            },
            baseObj,
            {},
            context
          )
        };
      }
      if (t.endsWith(".Smooth")) {
        // PIL SMOOTH kernel: [1,1,1, 1,5,1, 1,1,1] with scale=13.
        return {
          output: await runShaderNode(
            filtersConvolve3x3V1,
            {
              row0: d.vec4f(1, 1, 1, 0),
              row1: d.vec4f(1, 5, 1, 0),
              row2: d.vec4f(1, 1, 1, 13)
            },
            baseObj,
            {},
            context
          )
        };
      }

      // Expand: add a coloured border via transform.pad (GPU, browser-capable).
      if (t.endsWith(".Expand")) {
        const border = Number((this as any).border ?? 0);
        const fill = Number((this as any).fill ?? 0) / 255;
        const { width: srcW, height: srcH } = await imageDimensions(
          baseObj,
          context
        );
        if (!srcW || !srcH) return { output: baseObj ?? {} };
        return {
          output: await runShaderNode(
            transformPadV1,
            {
              left: border / srcW,
              top: border / srcH,
              right: border / srcW,
              bottom: border / srcH,
              color: d.vec4f(fill, fill, fill, 1)
            },
            baseObj,
            { outputWidth: srcW + 2 * border, outputHeight: srcH + 2 * border },
            context
          )
        };
      }

      // Canny — multi-stage CPU edge detection on the decoded luminance. Pure
      // JS (no sharp), so it runs in the browser too.
      if (t.endsWith(".Canny")) {
        const lowThreshold = Number((this as any).low_threshold ?? 100);
        const highThreshold = Number((this as any).high_threshold ?? 200);
        const { rgba, width: w, height: h } = await decodeRgba(baseObj, context);
        if (!w || !h) return { output: baseObj ?? {} };
        // Rec.601 luminance.
        const grayData = new Uint8Array(w * h);
        for (let i = 0; i < w * h; i++) {
          grayData[i] = Math.round(
            0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]
          );
        }
        // Apply Gaussian blur (sigma=1.4, kernel size=5)
        const blurred = new Float32Array(w * h);
        const gaussKernel = [
          0.0029, 0.0131, 0.0215, 0.0131, 0.0029, 0.0131, 0.0586, 0.0965,
          0.0586, 0.0131, 0.0215, 0.0965, 0.1592, 0.0965, 0.0215, 0.0131,
          0.0586, 0.0965, 0.0586, 0.0131, 0.0029, 0.0131, 0.0215, 0.0131,
          0.0029
        ];
        // Blur every pixel, including the border. Kernel taps that fall outside
        // the image clamp to the nearest edge pixel (clamp-to-edge sampling);
        // skipping the border would leave a 2px zero frame that the Sobel pass
        // reads as a spurious edge just inside the image.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let ky = -2; ky <= 2; ky++) {
              const sy = Math.min(h - 1, Math.max(0, y + ky));
              for (let kx = -2; kx <= 2; kx++) {
                const sx = Math.min(w - 1, Math.max(0, x + kx));
                sum += grayData[sy * w + sx] * gaussKernel[(ky + 2) * 5 + (kx + 2)];
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
        const result = new Uint8Array(w * h);
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
        // Expand the single-channel edge map to opaque RGBA for encoding.
        const outRgba = new Uint8Array(w * h * 4);
        for (let i = 0; i < w * h; i++) {
          const v = result[i];
          outRgba[i * 4] = v;
          outRgba[i * 4 + 1] = v;
          outRgba[i * 4 + 2] = v;
          outRgba[i * 4 + 3] = 255;
        }
        return { output: rawRgbaImageRef(outRgba, w, h) };
      }

      // Unknown filter type — pass the source through unchanged.
      return { output: baseObj ?? {} };
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

export const LIB_IMAGE_FILTER_NODES: readonly NodeClass[] = tagAsBrowserGpu(
  tagAsContentCard(DESCRIPTORS.map(createFilterNode))
);
