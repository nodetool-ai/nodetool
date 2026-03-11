import { BaseNode, registerDeclaredProperty } from "@nodetool/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool/node-sdk";
import sharp from "sharp";

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  basicFields: string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};
type ImageRefLike = { data?: string | Uint8Array; uri?: string; [k: string]: unknown };

function decodeImage(ref: unknown): Buffer | null {
  if (!ref || typeof ref !== "object") return null;
  const data = (ref as ImageRefLike).data;
  if (!data) return null;
  if (data instanceof Uint8Array) return Buffer.from(data);
  if (typeof data === "string") return Buffer.from(data, "base64");
  return null;
}

function toRef(buf: Buffer, base?: unknown): Record<string, unknown> {
  const seed = base && typeof base === "object" ? (base as Record<string, unknown>) : {};
  return {
    ...seed,
    data: buf.toString("base64"),
  };
}

function pickImage(inputs: Record<string, unknown>, props: Record<string, unknown>): unknown {
  const keys = [
    "image",
    "input",
    "source",
    "foreground",
    "background",
    "image1",
    "image2",
    "base_image",
    "mask",
  ];
  for (const key of keys) {
    if (key in inputs) return inputs[key];
  }
  for (const key of keys) {
    if (key in props) return props[key];
  }
  return null;
}

function createPillowNode(desc: Desc): NodeClass {
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly basicFields = desc.basicFields;
    static readonly metadataOutputTypes = desc.outputs;

    async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
      const t = desc.nodeType;

      if (t === "lib.pillow.draw.Background") {
        const width = Number(inputs.width ?? this.width ?? 512);
        const height = Number(inputs.height ?? this.height ?? 512);
        const color = String((inputs.color ?? this.color ?? "#000000") as string);
        const buf = await sharp({
          create: { width: Math.max(1, width), height: Math.max(1, height), channels: 4, background: color },
        })
          .png()
          .toBuffer();
        return { output: { data: buf.toString("base64") } };
      }

      const baseObj = pickImage(inputs, this.serialize());
      const baseBytes = decodeImage(baseObj);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      let img = sharp(baseBytes, { failOn: "none" });

      if (t === "lib.pillow.__init__.Blend") {
        const other = decodeImage(inputs.image2 ?? this.image2);
        if (other) {
          const alpha = Number(inputs.alpha ?? this.alpha ?? 0.5);
          const adjusted = await sharp(other)
            .ensureAlpha(Math.max(0, Math.min(1, alpha)))
            .png()
            .toBuffer();
          const mixed = await sharp(baseBytes)
            .composite([{ input: adjusted, blend: "over" }])
            .png()
            .toBuffer();
          return { output: toRef(mixed, baseObj) };
        }
      }

      if (t === "lib.pillow.__init__.Composite") {
        const fg = decodeImage(inputs.foreground ?? this.foreground ?? inputs.image1 ?? this.image1);
        if (fg) {
          const mixed = await sharp(baseBytes).composite([{ input: fg, blend: "over" }]).png().toBuffer();
          return { output: toRef(mixed, baseObj) };
        }
      }

      if (t.includes(".filter.Blur")) img = img.blur(Number(inputs.sigma ?? this.sigma ?? 1.2));
      else if (t.includes(".filter.Invert")) img = img.negate();
      else if (t.includes(".filter.ConvertToGrayscale")) img = img.grayscale();
      else if (t.includes(".filter.Solarize")) img = img.threshold(Number(inputs.threshold ?? this.threshold ?? 128));
      else if (t.includes(".filter.Smooth")) img = img.median(3);
      else if (t.includes(".filter.Emboss")) img = img.convolve({ width: 3, height: 3, kernel: [-2, -1, 0, -1, 1, 1, 0, 1, 2] });
      else if (t.includes(".filter.FindEdges") || t.includes(".filter.Canny") || t.includes(".filter.Contour"))
        img = img.convolve({ width: 3, height: 3, kernel: [-1, -1, -1, -1, 8, -1, -1, -1, -1] });
      else if (t.includes(".filter.Posterize")) img = img.png({ palette: true, colors: 16 });
      else if (t.includes(".filter.GetChannel")) {
        const channel = String(inputs.channel ?? this.channel ?? "red").toLowerCase();
        const idx = channel === "green" ? 1 : channel === "blue" ? 2 : 0;
        img = img.extractChannel(idx).toColourspace("b-w");
      } else if (t.includes(".filter.Expand")) {
        const border = Number(inputs.border ?? this.border ?? 10);
        const color = String(inputs.color ?? this.color ?? "black");
        img = img.extend({ top: border, left: border, right: border, bottom: border, background: color });
      } else if (t.includes(".enhance.Sharpen") || t.includes(".enhance.UnsharpMask") || t.includes(".enhance.Sharpness"))
        img = img.sharpen();
      else if (t.includes(".enhance.Equalize") || t.includes(".enhance.AutoContrast") || t.includes(".enhance.AdaptiveContrast"))
        img = img.normalize();
      else if (t.includes(".enhance.Brightness")) {
        const amount = Number(inputs.amount ?? this.amount ?? 1);
        img = img.modulate({ brightness: amount });
      } else if (t.includes(".enhance.Contrast") || t.includes(".enhance.Detail") || t.includes(".enhance.EdgeEnhance"))
        img = img.linear(1.15, -(128 * 0.15));
      else if (t.includes(".enhance.Color")) {
        const amount = Number(inputs.amount ?? this.amount ?? 1);
        img = img.modulate({ saturation: amount });
      } else if (t.includes(".enhance.RankFilter")) img = img.median(3);
      else if (t.includes(".draw.GaussianNoise")) {
        const md = await img.metadata();
        const w = md.width ?? 512;
        const h = md.height ?? 512;
        const noiseRaw = Buffer.alloc(w * h * 3);
        for (let i = 0; i < noiseRaw.length; i += 1) {
          noiseRaw[i] = Math.floor(Math.random() * 256);
        }
        const noise = await sharp(noiseRaw, { raw: { width: w, height: h, channels: 3 } })
          .png()
          .toBuffer();
        img = sharp(
          await sharp(baseBytes)
            .composite([{ input: noise, blend: "soft-light" }])
            .png()
            .toBuffer()
        );
      } else if (t.includes(".draw.RenderText")) {
        const text = String(inputs.text ?? this.text ?? "");
        if (text) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="40" font-size="32" fill="white">${text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</text></svg>`;
          img = sharp(await sharp(baseBytes).composite([{ input: Buffer.from(svg) }]).png().toBuffer());
        }
      } else if (t.includes(".color_grading.")) {
        if (t.endsWith("SaturationVibrance")) img = img.modulate({ saturation: 1.2 });
        else if (t.endsWith("Exposure")) img = img.modulate({ brightness: 1.1, saturation: 1.05 });
        else if (t.endsWith("ColorBalance")) img = img.tint("#f2f2ff");
        else if (t.endsWith("Vignette")) {
          const md = await img.metadata();
          const w = md.width ?? 512;
          const h = md.height ?? 512;
          const overlaySvg = `<svg xmlns='http://www.w3.org/2000/svg' width='${w}' height='${h}'><defs><radialGradient id='g'><stop offset='55%' stop-color='black' stop-opacity='0'/><stop offset='100%' stop-color='black' stop-opacity='0.35'/></radialGradient></defs><rect width='100%' height='100%' fill='url(#g)'/></svg>`;
          img = sharp(await sharp(baseBytes).composite([{ input: Buffer.from(overlaySvg), blend: "multiply" }]).png().toBuffer());
        } else if (t.endsWith("FilmLook")) img = img.modulate({ saturation: 0.9, brightness: 1.02 }).tint("#f7e8d0");
        else if (t.endsWith("SplitToning")) img = img.tint("#e6d8ff");
        else if (t.endsWith("HSLAdjust")) img = img.modulate({ saturation: 1.1, hue: 8 });
        else if (t.endsWith("LiftGammaGain")) img = img.gamma(1.1);
        else if (t.endsWith("Curves")) img = img.gamma(1.2);
        else if (t.endsWith("CDL")) img = img.linear(1.05, 0);
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
    nodeType: "lib.pillow.enhance.AdaptiveContrast",
    title: "Adaptive Contrast",
    description: "Applies localized contrast enhancement using adaptive techniques.\n    image, contrast, enhance\n\n    Use cases:\n    - Improve visibility in images with varying lighting conditions\n    - Prepare images for improved feature detection in computer vision",
    basicFields: [
      "image",
      "clip_limit",
      "grid_size"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the contrast for."
        }
      },
      {
        "name": "clip_limit",
        "options": {
          "type": "float",
          "default": 2,
          "title": "Clip Limit",
          "description": "Clip limit for adaptive contrast.",
          "min": 0,
          "max": 100
        }
      },
      {
        "name": "grid_size",
        "options": {
          "type": "int",
          "default": 8,
          "title": "Grid Size",
          "description": "Grid size for adaptive contrast.",
          "min": 1,
          "max": 64
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.AutoContrast",
    title: "Auto Contrast",
    description: "Automatically adjusts image contrast for enhanced visual quality.\n    image, contrast, balance\n\n    Use cases:\n    - Enhance image clarity for better visual perception\n    - Pre-process images for computer vision tasks\n    - Improve photo aesthetics in editing workflows",
    basicFields: [
      "image",
      "cutoff"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the contrast for."
        }
      },
      {
        "name": "cutoff",
        "options": {
          "type": "int",
          "default": 0,
          "title": "Cutoff",
          "description": "Represents the percentage of pixels to ignore at both the darkest and lightest ends of the histogram. A cutoff value of 5 means ignoring the darkest 5% and the lightest 5% of pixels, enhancing overall contrast by stretching the remaining pixel values across the full brightness range.",
          "min": 0,
          "max": 255
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Brightness",
    title: "Brightness",
    description: "Adjusts overall image brightness to lighten or darken.\n    image, brightness, enhance\n\n    Use cases:\n    - Correct underexposed or overexposed photographs\n    - Enhance visibility of dark image regions\n    - Prepare images for consistent display across devices",
    basicFields: [
      "image",
      "factor"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the brightness for."
        }
      },
      {
        "name": "factor",
        "options": {
          "type": "union[float, int]",
          "default": 1,
          "title": "Factor",
          "description": "Factor to adjust the brightness. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Color",
    title: "Color",
    description: "Adjusts color intensity of an image.\n    image, color, enhance\n\n    Use cases:\n    - Enhance color vibrancy in photographs\n    - Correct color imbalances in digital images\n    - Prepare images for consistent brand color representation",
    basicFields: [
      "image",
      "factor"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the brightness for."
        }
      },
      {
        "name": "factor",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Factor",
          "description": "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Contrast",
    title: "Contrast",
    description: "Adjusts image contrast to modify light-dark differences.\n    image, contrast, enhance\n\n    Use cases:\n    - Enhance visibility of details in low-contrast images\n    - Prepare images for visual analysis or recognition tasks\n    - Create dramatic effects in artistic photography",
    basicFields: [
      "image",
      "factor"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the brightness for."
        }
      },
      {
        "name": "factor",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Factor",
          "description": "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Detail",
    title: "Detail",
    description: "Enhances fine details in images.\n    image, detail, enhance\n\n    Use cases:\n    - Improve clarity of textural elements in photographs\n    - Enhance visibility of small features for analysis\n    - Prepare images for high-resolution display or printing",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to detail."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.EdgeEnhance",
    title: "Edge Enhance",
    description: "Enhances edge visibility by increasing contrast along boundaries.\n    image, edge, enhance\n\n    Use cases:\n    - Improve object boundary detection for computer vision\n    - Highlight structural elements in technical drawings\n    - Prepare images for feature extraction in image analysis",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to edge enhance."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Equalize",
    title: "Equalize",
    description: "Enhances image contrast by equalizing intensity distribution.\n    image, contrast, histogram\n\n    Use cases:\n    - Improve visibility in poorly lit images\n    - Enhance details for image analysis tasks\n    - Normalize image data for machine learning",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to equalize."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.RankFilter",
    title: "Rank Filter",
    description: "Applies rank-based filtering to enhance or smooth image features.\n    image, filter, enhance\n\n    Use cases:\n    - Reduce noise while preserving edges in images\n    - Enhance specific image features based on local intensity\n    - Pre-process images for improved segmentation results",
    basicFields: [
      "image",
      "size",
      "rank"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to rank filter."
        }
      },
      {
        "name": "size",
        "options": {
          "type": "int",
          "default": 3,
          "title": "Size",
          "description": "Rank filter size.",
          "min": 1,
          "max": 512
        }
      },
      {
        "name": "rank",
        "options": {
          "type": "int",
          "default": 3,
          "title": "Rank",
          "description": "Rank filter rank.",
          "min": 1,
          "max": 512
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Sharpen",
    title: "Sharpen",
    description: "Enhances image detail by intensifying local pixel contrast.\n    image, sharpen, clarity\n\n    Use cases:\n    - Improve clarity of photographs for print or display\n    - Refine texture details in product photography\n    - Enhance readability of text in document images",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to sharpen."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.Sharpness",
    title: "Sharpness",
    description: "Adjusts image sharpness to enhance or reduce detail clarity.\n    image, clarity, sharpness\n\n    Use cases:\n    - Enhance photo details for improved visual appeal\n    - Refine images for object detection tasks\n    - Correct slightly blurred images",
    basicFields: [
      "image",
      "factor"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the brightness for."
        }
      },
      {
        "name": "factor",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Factor",
          "description": "Factor to adjust the contrast. 1.0 means no change."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.enhance.UnsharpMask",
    title: "Unsharp Mask",
    description: "Sharpens images using the unsharp mask technique.\n    image, sharpen, enhance\n\n    Use cases:\n    - Enhance edge definition in photographs\n    - Improve perceived sharpness of digital artwork\n    - Prepare images for high-quality printing or display",
    basicFields: [
      "image",
      "radius",
      "percent",
      "threshold"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to unsharp mask."
        }
      },
      {
        "name": "radius",
        "options": {
          "type": "int",
          "default": 2,
          "title": "Radius",
          "description": "Unsharp mask radius.",
          "min": 0,
          "max": 512
        }
      },
      {
        "name": "percent",
        "options": {
          "type": "int",
          "default": 150,
          "title": "Percent",
          "description": "Unsharp mask percent.",
          "min": 0,
          "max": 1000
        }
      },
      {
        "name": "threshold",
        "options": {
          "type": "int",
          "default": 3,
          "title": "Threshold",
          "description": "Unsharp mask threshold.",
          "min": 0,
          "max": 512
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.__init__.Blend",
    title: "Blend",
    description: "Blend two images with adjustable alpha mixing.\n    blend, mix, fade, transition\n\n    Use cases:\n    - Create smooth transitions between images\n    - Adjust opacity of overlays\n    - Combine multiple exposures or effects",
    basicFields: [
      "image1",
      "image2",
      "alpha"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image1",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image1",
          "description": "The first image to blend."
        }
      },
      {
        "name": "image2",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image2",
          "description": "The second image to blend."
        }
      },
      {
        "name": "alpha",
        "options": {
          "type": "float",
          "default": 0.5,
          "title": "Alpha",
          "description": "The mix ratio.",
          "min": 0,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.__init__.Composite",
    title: "Composite",
    description: "Combine two images using a mask for advanced compositing.\n    composite, mask, blend, layering\n\n    Use cases:\n    - Create complex image compositions\n    - Apply selective blending or effects\n    - Implement advanced photo editing techniques",
    basicFields: [
      "image1",
      "image2",
      "mask"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image1",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image1",
          "description": "The first image to composite."
        }
      },
      {
        "name": "image2",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image2",
          "description": "The second image to composite."
        }
      },
      {
        "name": "mask",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Mask",
          "description": "The mask to composite with."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.CDL",
    title: "CDL",
    description: "ASC CDL (Color Decision List) color correction.\n    cdl, slope, offset, power, saturation, asc, color decision list\n\n    Use cases:\n    - Apply industry-standard CDL color correction\n    - Exchange color grades between different software\n    - Apply precise mathematical color transformations\n    - Create consistent looks across multiple shots\n\n    Formula: output = (input * slope + offset) ^ power\n    Followed by saturation adjustment.",
    basicFields: [
      "image",
      "slope_r",
      "slope_g",
      "slope_b",
      "offset_r",
      "offset_g",
      "offset_b",
      "power_r",
      "power_g",
      "power_b",
      "saturation"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to color correct."
        }
      },
      {
        "name": "slope_r",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Slope R",
          "description": "Red slope (multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "slope_g",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Slope G",
          "description": "Green slope (multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "slope_b",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Slope B",
          "description": "Blue slope (multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "offset_r",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Offset R",
          "description": "Red offset (addition).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "offset_g",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Offset G",
          "description": "Green offset (addition).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "offset_b",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Offset B",
          "description": "Blue offset (addition).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "power_r",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Power R",
          "description": "Red power (gamma).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "power_g",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Power G",
          "description": "Green power (gamma).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "power_b",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Power B",
          "description": "Blue power (gamma).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "saturation",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Saturation",
          "description": "Saturation adjustment.",
          "min": 0,
          "max": 4
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.ColorBalance",
    title: "Color Balance",
    description: "Adjust color temperature and tint for white balance correction.\n    white balance, temperature, tint, color balance, warm, cool\n\n    Use cases:\n    - Correct white balance in photos and video\n    - Warm up or cool down the overall image\n    - Fix color casts from mixed lighting\n    - Create mood through color temperature shifts",
    basicFields: [
      "image",
      "temperature",
      "tint"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust."
        }
      },
      {
        "name": "temperature",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Temperature",
          "description": "Color temperature. Positive = warmer (orange), negative = cooler (blue).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "tint",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Tint",
          "description": "Color tint. Positive = magenta, negative = green.",
          "min": -1,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.Curves",
    title: "Curves",
    description: "RGB curves adjustment with control points for precise tonal control.\n    curves, rgb, tonal, contrast, levels\n\n    Use cases:\n    - Create custom contrast curves\n    - Adjust specific tonal ranges precisely\n    - Create cross-processed or stylized looks\n    - Match the tonal characteristics of film stocks",
    basicFields: [
      "image",
      "black_point",
      "white_point",
      "shadows",
      "midtones",
      "highlights",
      "red_midtones",
      "green_midtones",
      "blue_midtones"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust."
        }
      },
      {
        "name": "black_point",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Black Point",
          "description": "Input black point (lifts shadows).",
          "min": 0,
          "max": 0.5
        }
      },
      {
        "name": "white_point",
        "options": {
          "type": "float",
          "default": 1,
          "title": "White Point",
          "description": "Input white point (compresses highlights).",
          "min": 0.5,
          "max": 1
        }
      },
      {
        "name": "shadows",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Shadows",
          "description": "Shadow curve adjustment.",
          "min": -0.5,
          "max": 0.5
        }
      },
      {
        "name": "midtones",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Midtones",
          "description": "Midtone curve adjustment (gamma).",
          "min": -0.5,
          "max": 0.5
        }
      },
      {
        "name": "highlights",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Highlights",
          "description": "Highlight curve adjustment.",
          "min": -0.5,
          "max": 0.5
        }
      },
      {
        "name": "red_midtones",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Red Midtones",
          "description": "Red channel midtone adjustment.",
          "min": -0.5,
          "max": 0.5
        }
      },
      {
        "name": "green_midtones",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Green Midtones",
          "description": "Green channel midtone adjustment.",
          "min": -0.5,
          "max": 0.5
        }
      },
      {
        "name": "blue_midtones",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Blue Midtones",
          "description": "Blue channel midtone adjustment.",
          "min": -0.5,
          "max": 0.5
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.Exposure",
    title: "Exposure",
    description: "Comprehensive tonal exposure controls similar to Lightroom/Camera Raw.\n    exposure, contrast, highlights, shadows, whites, blacks, tonal\n\n    Use cases:\n    - Correct over/underexposed images\n    - Recover highlight and shadow detail\n    - Adjust overall contrast and tonal range\n    - Fine-tune the brightness of specific tonal regions",
    basicFields: [
      "image",
      "exposure",
      "contrast",
      "highlights",
      "shadows",
      "whites",
      "blacks"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust."
        }
      },
      {
        "name": "exposure",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Exposure",
          "description": "Exposure adjustment in stops. Affects entire image.",
          "min": -5,
          "max": 5
        }
      },
      {
        "name": "contrast",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Contrast",
          "description": "Contrast adjustment. Affects midtone separation.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "highlights",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Highlights",
          "description": "Highlight recovery/boost. Affects brightest areas.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "shadows",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Shadows",
          "description": "Shadow recovery/darken. Affects darkest areas.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "whites",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Whites",
          "description": "White point adjustment. Sets the brightest white.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "blacks",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Blacks",
          "description": "Black point adjustment. Sets the darkest black.",
          "min": -1,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.FilmLook",
    title: "Film Look",
    description: "Apply preset cinematic film looks with adjustable intensity.\n    film look, cinematic, preset, movie, lut, color grade\n\n    Use cases:\n    - Quickly apply popular cinematic color grades\n    - Create consistent looks across multiple images\n    - Emulate classic film stock characteristics\n    - Starting point for custom color grading",
    basicFields: [
      "image",
      "preset",
      "intensity"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to apply the film look to."
        }
      },
      {
        "name": "preset",
        "options": {
          "type": "enum",
          "default": "teal_orange",
          "title": "Preset",
          "description": "The cinematic look to apply.",
          "values": [
            "teal_orange",
            "blockbuster",
            "noir",
            "vintage",
            "cold_blue",
            "warm_sunset",
            "matrix",
            "bleach_bypass",
            "cross_process",
            "faded_film"
          ]
        }
      },
      {
        "name": "intensity",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Intensity",
          "description": "Intensity of the effect. 0=none, 1=full, 2=exaggerated.",
          "min": 0,
          "max": 2
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.HSLAdjust",
    title: "HSLAdjust",
    description: "Adjust hue, saturation, and luminance for specific color ranges.\n    hsl, hue, saturation, luminance, selective color, color range\n\n    Use cases:\n    - Shift specific colors (e.g., make blues more cyan)\n    - Desaturate or boost individual color ranges\n    - Brighten or darken specific colors\n    - Create color-specific looks (teal skies, orange skin)",
    basicFields: [
      "image",
      "color_range",
      "hue_shift",
      "saturation",
      "luminance"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust."
        }
      },
      {
        "name": "color_range",
        "options": {
          "type": "enum",
          "default": "all",
          "title": "Color Range",
          "description": "The color range to adjust.",
          "values": [
            "all",
            "reds",
            "oranges",
            "yellows",
            "greens",
            "cyans",
            "blues",
            "purples",
            "magentas"
          ]
        }
      },
      {
        "name": "hue_shift",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Hue Shift",
          "description": "Hue shift for the selected color range. -1 to 1 = -180 to +180 degrees.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "saturation",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Saturation",
          "description": "Saturation adjustment for the selected color range.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "luminance",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Luminance",
          "description": "Luminance adjustment for the selected color range.",
          "min": -1,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.LiftGammaGain",
    title: "Lift Gamma Gain",
    description: "Three-way color corrector for shadows, midtones, and highlights.\n    lift, gamma, gain, color wheels, primary correction, shadows, midtones, highlights\n\n    Use cases:\n    - Apply the industry-standard three-way color correction\n    - Balance colors across different tonal ranges\n    - Create color contrast between shadows and highlights\n    - Match footage from different sources\n\n    Lift affects shadows, Gamma affects midtones, Gain affects highlights.\n    Each control adjusts both luminance and color for its tonal range.",
    basicFields: [
      "image",
      "lift_r",
      "lift_g",
      "lift_b",
      "lift_master",
      "gamma_r",
      "gamma_g",
      "gamma_b",
      "gamma_master",
      "gain_r",
      "gain_g",
      "gain_b",
      "gain_master"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to color correct."
        }
      },
      {
        "name": "lift_r",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Lift R",
          "description": "Red lift (shadow color shift).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "lift_g",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Lift G",
          "description": "Green lift (shadow color shift).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "lift_b",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Lift B",
          "description": "Blue lift (shadow color shift).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "lift_master",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Lift Master",
          "description": "Master lift (shadow brightness).",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "gamma_r",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gamma R",
          "description": "Red gamma (midtone adjustment).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "gamma_g",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gamma G",
          "description": "Green gamma (midtone adjustment).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "gamma_b",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gamma B",
          "description": "Blue gamma (midtone adjustment).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "gamma_master",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gamma Master",
          "description": "Master gamma (overall midtones).",
          "min": 0.1,
          "max": 4
        }
      },
      {
        "name": "gain_r",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gain R",
          "description": "Red gain (highlight multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "gain_g",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gain G",
          "description": "Green gain (highlight multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "gain_b",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gain B",
          "description": "Blue gain (highlight multiplier).",
          "min": 0,
          "max": 4
        }
      },
      {
        "name": "gain_master",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Gain Master",
          "description": "Master gain (overall brightness).",
          "min": 0,
          "max": 4
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.SaturationVibrance",
    title: "Saturation Vibrance",
    description: "Adjust color saturation with vibrance protection for skin tones.\n    saturation, vibrance, color intensity, skin tones\n\n    Use cases:\n    - Boost color intensity without clipping\n    - Protect skin tones while increasing saturation\n    - Create desaturated or oversaturated looks\n    - Fine-tune color intensity independently",
    basicFields: [
      "image",
      "saturation",
      "vibrance"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust."
        }
      },
      {
        "name": "saturation",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Saturation",
          "description": "Global saturation. 0 = no change, -1 = grayscale, 1 = 2x saturation.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "vibrance",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Vibrance",
          "description": "Smart saturation that protects already-saturated colors and skin tones.",
          "min": -1,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.SplitToning",
    title: "Split Toning",
    description: "Apply different color tints to shadows and highlights.\n    split toning, shadows, highlights, tint, duotone\n\n    Use cases:\n    - Create classic teal and orange looks\n    - Add color contrast between shadows and highlights\n    - Emulate film processing techniques\n    - Create stylized color-graded images",
    basicFields: [
      "image",
      "shadow_hue",
      "shadow_saturation",
      "highlight_hue",
      "highlight_saturation",
      "balance"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to apply split toning to."
        }
      },
      {
        "name": "shadow_hue",
        "options": {
          "type": "float",
          "default": 200,
          "title": "Shadow Hue",
          "description": "Hue of shadow tint in degrees (0=red, 120=green, 240=blue).",
          "min": 0,
          "max": 360
        }
      },
      {
        "name": "shadow_saturation",
        "options": {
          "type": "float",
          "default": 0.3,
          "title": "Shadow Saturation",
          "description": "Saturation of shadow tint.",
          "min": 0,
          "max": 1
        }
      },
      {
        "name": "highlight_hue",
        "options": {
          "type": "float",
          "default": 40,
          "title": "Highlight Hue",
          "description": "Hue of highlight tint in degrees.",
          "min": 0,
          "max": 360
        }
      },
      {
        "name": "highlight_saturation",
        "options": {
          "type": "float",
          "default": 0.3,
          "title": "Highlight Saturation",
          "description": "Saturation of highlight tint.",
          "min": 0,
          "max": 1
        }
      },
      {
        "name": "balance",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Balance",
          "description": "Balance between shadows (-1) and highlights (+1).",
          "min": -1,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.color_grading.Vignette",
    title: "Vignette",
    description: "Apply cinematic vignette effect to darken or lighten image edges.\n    vignette, edge, darken, focus, cinematic\n\n    Use cases:\n    - Draw attention to the center of the image\n    - Create a classic cinematic look\n    - Simulate lens light falloff\n    - Add subtle framing to photos",
    basicFields: [
      "image",
      "amount",
      "midpoint",
      "roundness",
      "feather"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to apply vignette to."
        }
      },
      {
        "name": "amount",
        "options": {
          "type": "float",
          "default": 0.5,
          "title": "Amount",
          "description": "Vignette amount. Positive darkens edges, negative lightens.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "midpoint",
        "options": {
          "type": "float",
          "default": 0.5,
          "title": "Midpoint",
          "description": "Distance from center where vignette begins (0=center, 1=edges).",
          "min": 0,
          "max": 1
        }
      },
      {
        "name": "roundness",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Roundness",
          "description": "Shape of vignette. 0=oval matching image aspect, 1=circular, -1=rectangular.",
          "min": -1,
          "max": 1
        }
      },
      {
        "name": "feather",
        "options": {
          "type": "float",
          "default": 0.5,
          "title": "Feather",
          "description": "Softness of the vignette edge.",
          "min": 0,
          "max": 1
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Blur",
    title: "Blur",
    description: "Apply a Gaussian blur effect to an image.\n    image, filter, blur\n\n    - Soften images or reduce noise and detail\n    - Make focal areas stand out by blurring surroundings\n    - Protect privacy by blurring sensitive information",
    basicFields: [
      "image",
      "radius"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to blur."
        }
      },
      {
        "name": "radius",
        "options": {
          "type": "int",
          "default": 2,
          "title": "Radius",
          "description": "Blur radius.",
          "min": 0,
          "max": 128
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Canny",
    title: "Canny",
    description: "Apply Canny edge detection to an image.\n    image, filter, edges\n\n    - Highlight areas of rapid intensity change\n    - Outline object boundaries and structure\n    - Enhance inputs for object detection and image segmentation",
    basicFields: [
      "image",
      "low_threshold",
      "high_threshold"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to canny."
        }
      },
      {
        "name": "low_threshold",
        "options": {
          "type": "int",
          "default": 100,
          "title": "Low Threshold",
          "description": "Low threshold.",
          "min": 0,
          "max": 255
        }
      },
      {
        "name": "high_threshold",
        "options": {
          "type": "int",
          "default": 200,
          "title": "High Threshold",
          "description": "High threshold.",
          "min": 0,
          "max": 255
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Contour",
    title: "Contour",
    description: "Apply a contour filter to highlight image edges.\n    image, filter, contour\n\n    - Extract key features from complex images\n    - Aid pattern recognition and object detection\n    - Create stylized contour sketch art effects",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to contour."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.ConvertToGrayscale",
    title: "Convert To Grayscale",
    description: "Convert an image to grayscale.\n    image, grayscale\n\n    - Simplify images for feature and edge detection\n    - Prepare images for shape-based machine learning\n    - Create vintage or monochrome aesthetic effects",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to convert."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Emboss",
    title: "Emboss",
    description: "Apply an emboss filter for a 3D raised effect.\n    image, filter, emboss\n\n    - Add texture and depth to photos\n    - Create visually interesting graphics\n    - Incorporate unique effects in digital artwork",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to emboss."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Expand",
    title: "Expand",
    description: "Add a border around an image to increase its size.\n    image, border, expand\n\n    - Make images stand out by adding a colored border\n    - Create framed photo effects\n    - Separate image content from surroundings",
    basicFields: [
      "image",
      "border",
      "fill"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to expand."
        }
      },
      {
        "name": "border",
        "options": {
          "type": "int",
          "default": 0,
          "title": "Border",
          "description": "Border size.",
          "min": 0,
          "max": 512
        }
      },
      {
        "name": "fill",
        "options": {
          "type": "int",
          "default": 0,
          "title": "Fill",
          "description": "Fill color.",
          "min": 0,
          "max": 255
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.FindEdges",
    title: "Find Edges",
    description: "Detect and highlight edges in an image.\n    image, filter, edges\n\n    - Analyze structural patterns in images\n    - Aid object detection in computer vision\n    - Detect important features like corners and ridges",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to find edges."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.GetChannel",
    title: "Get Channel",
    description: "Extract a specific color channel from an image.\n    image, color, channel, isolate, extract\n\n    - Isolate color information for image analysis\n    - Manipulate specific color components in graphic design\n    - Enhance or reduce visibility of certain colors",
    basicFields: [
      "image",
      "channel"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to get the channel from."
        }
      },
      {
        "name": "channel",
        "options": {
          "type": "enum",
          "default": "R",
          "title": "Channel",
          "values": [
            "R",
            "G",
            "B"
          ]
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Invert",
    title: "Invert",
    description: "Invert the colors of an image.\n    image, filter, invert\n\n    - Create negative versions of images for visual effects\n    - Analyze image data by bringing out hidden details\n    - Preprocess images for operations that work better on inverted colors",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to adjust the brightness for."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Posterize",
    title: "Posterize",
    description: "Reduce the number of colors in an image for a poster-like effect.\n    image, filter, posterize\n\n    - Create graphic art by simplifying image colors\n    - Apply artistic effects to photographs\n    - Generate visually compelling content for advertising",
    basicFields: [
      "image",
      "bits"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to posterize."
        }
      },
      {
        "name": "bits",
        "options": {
          "type": "int",
          "default": 4,
          "title": "Bits",
          "description": "Number of bits to posterize to.",
          "min": 1,
          "max": 8
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Smooth",
    title: "Smooth",
    description: "Apply smoothing to reduce image noise and detail.\n    image, filter, smooth\n\n    - Enhance visual aesthetics of images\n    - Improve object detection by reducing irrelevant details\n    - Aid facial recognition by simplifying images",
    basicFields: [
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to smooth."
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.filter.Solarize",
    title: "Solarize",
    description: "Apply a solarize effect to partially invert image tones.\n    image, filter, solarize\n\n    - Create surreal artistic photo effects\n    - Enhance visual data by making certain elements more prominent\n    - Add a unique style to images for graphic design",
    basicFields: [
      "image",
      "threshold"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to solarize."
        }
      },
      {
        "name": "threshold",
        "options": {
          "type": "int",
          "default": 128,
          "title": "Threshold",
          "description": "Threshold for solarization.",
          "min": 0,
          "max": 255
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.draw.Background",
    title: "Background",
    description: "The Background Node creates a blank background.\n    image, background, blank, base, layer\n    This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.\n\n    #### Applications\n    - As a base layer for creating composite images.\n    - As a starting point for generating patterns or graphics.\n    - When blank backgrounds of specific colors are required for visualization tasks.",
    basicFields: [
      "width",
      "height",
      "color"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "width",
        "options": {
          "type": "int",
          "default": 512,
          "title": "Width",
          "min": 1,
          "max": 4096
        }
      },
      {
        "name": "height",
        "options": {
          "type": "int",
          "default": 512,
          "title": "Height",
          "min": 1,
          "max": 4096
        }
      },
      {
        "name": "color",
        "options": {
          "type": "color",
          "default": {
            "type": "color",
            "value": "#FFFFFF"
          },
          "title": "Color"
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.draw.GaussianNoise",
    title: "Gaussian Noise",
    description: "This node creates and adds Gaussian noise to an image.\n    image, noise, gaussian, distortion, artifact\n\n    The Gaussian Noise Node is designed to simulate realistic distortions that can occur in a photographic image. It generates a noise-filled image using the Gaussian (normal) distribution. The noise level can be adjusted using the mean and standard deviation parameters.\n\n    #### Applications\n    - Simulating sensor noise in synthetic data.\n    - Testing image-processing algorithms' resilience to noise.\n    - Creating artistic effects in images.",
    basicFields: [
      "mean",
      "stddev",
      "width",
      "height"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "mean",
        "options": {
          "type": "float",
          "default": 0,
          "title": "Mean"
        }
      },
      {
        "name": "stddev",
        "options": {
          "type": "float",
          "default": 1,
          "title": "Stddev"
        }
      },
      {
        "name": "width",
        "options": {
          "type": "int",
          "default": 512,
          "title": "Width",
          "min": 1,
          "max": 1024
        }
      },
      {
        "name": "height",
        "options": {
          "type": "int",
          "default": 512,
          "title": "Height",
          "min": 1,
          "max": 1024
        }
      }
    ]
  },
  {
    nodeType: "lib.pillow.draw.RenderText",
    title: "Render Text",
    description: "This node allows you to add text to images using system fonts or web fonts.\n    text, font, label, title, watermark, caption, image, overlay, google fonts\n\n    This node takes text, font updates, coordinates (where to place the text), and an image to work with.\n    A user can use the Render Text Node to add a label or title to an image, watermark an image,\n    or place a caption directly on an image.\n\n    The Render Text Node offers customizable options, including the ability to choose the text's font,\n    size, color, and alignment (left, center, or right). Text placement can also be defined,\n    providing flexibility to place the text wherever you see fit.\n\n    ### Font Sources\n\n    The node supports three font sources:\n\n    1. **System Fonts** (default): Use fonts installed on the system\n       - `FontRef(name=\"Arial\")` - Uses local Arial font\n\n    2. **Google Fonts**: Automatically download and cache fonts from Google Fonts\n       - `FontRef(name=\"Roboto\", source=FontSource.GOOGLE_FONTS)`\n       - `FontRef(name=\"Open Sans\", source=FontSource.GOOGLE_FONTS, weight=\"bold\")`\n       - Supports 50+ popular fonts including Roboto, Open Sans, Lato, Montserrat, Poppins, etc.\n\n    3. **Custom URL**: Download fonts from any URL\n       - `FontRef(name=\"CustomFont\", source=FontSource.URL, url=\"https://example.com/font.ttf\")`\n\n    #### Applications\n    - Labeling images in an image gallery or database.\n    - Watermarking images for copyright protection.\n    - Adding custom captions to photographs.\n    - Creating instructional images to guide the reader's view.\n    - Using premium Google Fonts for professional typography.",
    basicFields: [
      "text",
      "font",
      "x",
      "y",
      "size",
      "color",
      "align",
      "image"
    ],
    outputs: {
      "output": "image"
    },
    properties: [
      {
        "name": "text",
        "options": {
          "type": "str",
          "default": "",
          "title": "Text",
          "description": "The text to render."
        }
      },
      {
        "name": "font",
        "options": {
          "type": "font",
          "default": {
            "type": "font",
            "name": "DejaVuSans",
            "source": "system",
            "url": "",
            "weight": "regular"
          },
          "title": "Font",
          "description": "The font to use. Supports system fonts, Google Fonts, and custom URLs."
        }
      },
      {
        "name": "x",
        "options": {
          "type": "int",
          "default": 0,
          "title": "X",
          "description": "The x coordinate."
        }
      },
      {
        "name": "y",
        "options": {
          "type": "int",
          "default": 0,
          "title": "Y",
          "description": "The y coordinate."
        }
      },
      {
        "name": "size",
        "options": {
          "type": "int",
          "default": 12,
          "title": "Size",
          "description": "The font size.",
          "min": 1,
          "max": 512
        }
      },
      {
        "name": "color",
        "options": {
          "type": "color",
          "default": {
            "type": "color",
            "value": "#000000"
          },
          "title": "Color",
          "description": "The font color."
        }
      },
      {
        "name": "align",
        "options": {
          "type": "enum",
          "default": "left",
          "title": "Align",
          "values": [
            "left",
            "center",
            "right"
          ]
        }
      },
      {
        "name": "image",
        "options": {
          "type": "image",
          "default": {
            "type": "image",
            "uri": "",
            "asset_id": null,
            "data": null,
            "metadata": null
          },
          "title": "Image",
          "description": "The image to render on."
        }
      }
    ]
  }
] as const;

export const LIB_PILLOW_NODES: readonly NodeClass[] = DESCRIPTORS.map(createPillowNode);
