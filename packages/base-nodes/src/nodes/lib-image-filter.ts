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

function createFilterNode(desc: Desc): NodeClass {
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

      const baseObj = pickImage(this.serialize(), this.serialize());
      const baseBytes = await decodeImage(baseObj, context);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      let img = sharp(baseBytes, { failOn: "none" });

      // Solarize — raw pixel manipulation (NOT sharp.threshold!)
      if (t.endsWith(".Solarize")) {
        const threshold = Number((this as any).threshold ?? 128);
        const { data: raw, info } = await img
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (let i = 0; i < raw.length; i++) {
          if (raw[i] > threshold) raw[i] = 255 - raw[i];
        }
        const out = await sharp(raw, {
          raw: {
            width: info.width,
            height: info.height,
            channels: info.channels as 1 | 2 | 3 | 4
          }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      }

      // Posterize — raw pixel manipulation (NOT palette quantization!)
      if (t.endsWith(".Posterize")) {
        const bits = Math.max(
          1,
          Math.min(8, Math.round(Number((this as any).bits ?? 4)))
        );
        const mask = 0xff << (8 - bits);
        const { data: raw, info } = await img
          .raw()
          .toBuffer({ resolveWithObject: true });
        for (let i = 0; i < raw.length; i++) {
          raw[i] = raw[i] & mask;
        }
        const out = await sharp(raw, {
          raw: {
            width: info.width,
            height: info.height,
            channels: info.channels as 1 | 2 | 3 | 4
          }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      }

      // Pipeline-based nodes
      if (t.endsWith(".Blur")) {
        const radius = Number((this as any).radius ?? 2);
        img = img.blur(Math.max(0.3, radius));
      } else if (t.endsWith(".Invert")) {
        img = img.negate();
      } else if (t.endsWith(".ConvertToGrayscale")) {
        img = img.grayscale();
      } else if (t.endsWith(".Emboss")) {
        img = img.convolve({
          width: 3,
          height: 3,
          kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2]
        });
      } else if (t.endsWith(".FindEdges")) {
        img = img.convolve({
          width: 3,
          height: 3,
          kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1]
        });
      } else if (t.endsWith(".Canny")) {
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
      } else if (t.endsWith(".Contour")) {
        // Contour filter using Prewitt-like kernel distinct from FindEdges
        // Combine horizontal and vertical Prewitt for contour detection
        const { data: rawData, info: rawInfo } = await img
          .grayscale()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const cw = rawInfo.width;
        const ch = rawInfo.height;
        const contourBuf = Buffer.alloc(cw * ch);
        for (let y = 1; y < ch - 1; y++) {
          for (let x = 1; x < cw - 1; x++) {
            // Horizontal Prewitt
            const gx =
              -rawData[(y - 1) * cw + (x - 1)] -
              rawData[y * cw + (x - 1)] -
              rawData[(y + 1) * cw + (x - 1)] +
              rawData[(y - 1) * cw + (x + 1)] +
              rawData[y * cw + (x + 1)] +
              rawData[(y + 1) * cw + (x + 1)];
            // Vertical Prewitt
            const gy =
              -rawData[(y - 1) * cw + (x - 1)] -
              rawData[(y - 1) * cw + x] -
              rawData[(y - 1) * cw + (x + 1)] +
              rawData[(y + 1) * cw + (x - 1)] +
              rawData[(y + 1) * cw + x] +
              rawData[(y + 1) * cw + (x + 1)];
            contourBuf[y * cw + x] = Math.min(
              255,
              Math.round(Math.sqrt(gx * gx + gy * gy))
            );
          }
        }
        const out = await sharp(contourBuf, {
          raw: { width: cw, height: ch, channels: 1 }
        })
          .png()
          .toBuffer();
        return { output: toRef(out, baseObj) };
      } else if (t.endsWith(".Smooth")) {
        // PIL SMOOTH kernel: [1,1,1, 1,5,1, 1,1,1] with scale=13
        img = img.convolve({
          width: 3,
          height: 3,
          kernel: [1, 1, 1, 1, 5, 1, 1, 1, 1],
          scale: 13
        });
      } else if (t.endsWith(".GetChannel")) {
        const channel = String((this as any).channel ?? "red").toLowerCase();
        const idx = channel === "green" ? 1 : channel === "blue" ? 2 : 0;
        img = img.extractChannel(idx);
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
    nodeType: "lib.image.filter.Blur",
    title: "Blur",
    description:
      "Apply a Gaussian blur effect to an image.\n    image, filter, blur\n\n    - Soften images or reduce noise and detail\n    - Make focal areas stand out by blurring surroundings\n    - Protect privacy by blurring sensitive information",
    basicFields: ["image", "radius"],
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
          description: "The image to blur."
        }
      },
      {
        name: "radius",
        options: {
          type: "int",
          default: 2,
          title: "Radius",
          description: "Blur radius.",
          min: 0,
          max: 128
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Canny",
    title: "Canny",
    description:
      "Apply Canny edge detection to an image.\n    image, filter, edges\n\n    - Highlight areas of rapid intensity change\n    - Outline object boundaries and structure\n    - Enhance inputs for object detection and image segmentation",
    basicFields: ["image", "low_threshold", "high_threshold"],
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
    basicFields: ["image", "border", "fill"],
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
          description: "The image to find edges."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.GetChannel",
    title: "Get Channel",
    description:
      "Extract a specific color channel from an image.\n    image, color, channel, isolate, extract\n\n    - Isolate color information for image analysis\n    - Manipulate specific color components in graphic design\n    - Enhance or reduce visibility of certain colors",
    basicFields: ["image", "channel"],
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
          description: "The image to get the channel from."
        }
      },
      {
        name: "channel",
        options: {
          type: "enum",
          default: "R",
          title: "Channel",
          values: ["R", "G", "B"]
        }
      }
    ]
  },
  {
    nodeType: "lib.image.filter.Invert",
    title: "Invert",
    description:
      "Invert the colors of an image.\n    image, filter, invert\n\n    - Create negative versions of images for visual effects\n    - Analyze image data by bringing out hidden details\n    - Preprocess images for operations that work better on inverted colors",
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
    basicFields: ["image", "bits"],
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
    basicFields: ["image", "threshold"],
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

export const LIB_IMAGE_FILTER_NODES: readonly NodeClass[] =
  DESCRIPTORS.map(createFilterNode);
