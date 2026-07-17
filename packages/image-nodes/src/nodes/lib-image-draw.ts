/// <reference lib="dom" />
import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass, PropOptions } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  NODE_AND_BROWSER_PLATFORMS,
  SERVER_PLATFORMS
} from "@nodetool-ai/protocol";
import { IS_NODE } from "@nodetool-ai/config";
import * as d from "typegpu/data";
import { sourcesSolidV1, sourcesGaussianNoiseV1 } from "@nodetool-ai/gpu/pool";
import { pickImage } from "./lib-image-utils.js";
import {
  colorValueToVec4,
  premultiplyVec4,
  runShaderNode
} from "./lib-shader-utils.js";
import {
  loadImageBytes,
  toBase64Ref,
  toArrayBuffer,
  loadSharp,
  SHARP_UNAVAILABLE_MESSAGE
} from "./image-io.js";

// Finite-guarding numeric read (matches the `num` helper used across the
// package): NaN / non-finite values fall back instead of propagating.
function num(value: unknown, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

// Clamp a requested output dimension to [1, max]. Guards the low end, the NaN
// case (via num) and the high end so a programmatic graph can't request an
// arbitrarily large texture. `max` mirrors the prop metadata's documented max.
function clampDim(value: unknown, fallback: number, max: number): number {
  return Math.min(max, Math.max(1, Math.round(num(value, fallback))));
}

// Escape a value for interpolation into an XML/SVG attribute or text node.
// Escaping the quotes as well as &<> prevents a value from terminating the
// attribute string and injecting arbitrary markup into the SVG handed to sharp.
export function escapeXmlAttr(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

type Desc = {
  nodeType: string;
  title: string;
  description: string;
  inlineFields: string[];
  inputFields:  string[];
  outputs: Record<string, string>;
  properties: Array<{ name: string; options: PropOptions }>;
};

// Background (GPU), GaussianNoise (GPU) and RenderText (Canvas in the browser /
// sharp on Node) all run client-side. The Mask compositor still relies on sharp
// resize + alpha compositing → Node-only.
function isServerOnlyDraw(nodeType: string): boolean {
  return nodeType === "lib.image.Mask";
}

// Background + GaussianNoise composite on the GPU (WebGPU in the browser);
// RenderText uses Canvas2D / sharp and needs no GPU. Only the GPU ones must
// route to the server when the browser lacks WebGPU — see `tagAsBrowserGpu`.
function drawRequiresGpu(nodeType: string): boolean {
  return (
    nodeType === "lib.image.draw.Background" ||
    nodeType === "lib.image.draw.GaussianNoise"
  );
}

function createDrawNode(desc: Desc): NodeClass {
  const serverOnly = isServerOnlyDraw(desc.nodeType);
  const C = class extends BaseNode {
    static readonly nodeType = desc.nodeType;
    static readonly title = desc.title;
    static readonly description = desc.description;
    static readonly inlineFields = desc.inlineFields;
    static readonly inputFields  = desc.inputFields;
    static readonly metadataOutputTypes = desc.outputs;
    static readonly platforms = serverOnly
      ? SERVER_PLATFORMS
      : NODE_AND_BROWSER_PLATFORMS;
    static readonly requiresGpu: boolean | undefined = drawRequiresGpu(
      desc.nodeType
    )
      ? true
      : undefined;
    static readonly body: string | undefined = serverOnly
      ? undefined
      : "content_card";

    async process(
      context?: ProcessingContext
    ): Promise<Record<string, unknown>> {
      const t = desc.nodeType;

      if (t === "lib.image.draw.Background") {
        const width = clampDim((this as any).width, 512, 4096);
        const height = clampDim((this as any).height, 512, 4096);
        // Source module — no input texture, just the host-specified output dims.
        const [r, g, b, a] = premultiplyVec4(
          colorValueToVec4((this as any).color ?? "#FFFFFF", [1, 1, 1, 1])
        );
        return {
          output: await runShaderNode(
            sourcesSolidV1,
            { color: d.vec4f(r, g, b, a) },
            null,
            { outputWidth: width, outputHeight: height },
            context
          )
        };
      }

      if (t === "lib.image.draw.GaussianNoise") {
        const w = clampDim((this as any).width, 512, 1024);
        const h = clampDim((this as any).height, 512, 1024);
        const mean = num((this as any).mean, 0);
        const stddev = num((this as any).stddev, 1);
        // A fresh seed per run reproduces the old Math.random() variation.
        return {
          output: await runShaderNode(
            sourcesGaussianNoiseV1,
            { mean, stddev, seed: Math.floor(Math.random() * 100000) },
            null,
            { outputWidth: w, outputHeight: h },
            context
          )
        };
      }

      const baseObj = pickImage(
        this.serialize(),
        (
          this as unknown as { serialize(): Record<string, unknown> }
        ).serialize()
      );
      const baseBytes = await loadImageBytes(baseObj, context);
      if (baseBytes.length === 0) {
        return { output: baseObj ?? {} };
      }

      if (t === "lib.image.Mask") {
        const sharp = await loadSharp();
        if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
        const self = this as unknown as Record<string, unknown>;
        const fg = await loadImageBytes(
          self.foreground ?? self.image2 ?? self.image1,
          context
        );
        if (fg.length) {
          const mask = await loadImageBytes(self.mask, context);
          const baseMeta = await sharp(baseBytes, { failOn: "none" }).metadata();
          const width = Math.max(1, baseMeta.width ?? 1);
          const height = Math.max(1, baseMeta.height ?? 1);
          let fgInput = await sharp(fg, { failOn: "none" })
            .resize(width, height, { fit: "fill" })
            .ensureAlpha()
            .png()
            .toBuffer();
          if (mask.length) {
            const { data: fgRaw, info } = await sharp(fgInput, {
              failOn: "none"
            })
              .ensureAlpha()
              .raw()
              .toBuffer({ resolveWithObject: true });
            const maskRaw = await sharp(mask, { failOn: "none" })
              .resize(info.width, info.height, { fit: "fill" })
              .greyscale()
              .raw()
              .toBuffer();
            for (let i = 0; i < info.width * info.height; i += 1) {
              fgRaw[i * 4 + 3] = maskRaw[i];
            }
            fgInput = await sharp(fgRaw, {
              raw: { width: info.width, height: info.height, channels: 4 }
            })
              .png()
              .toBuffer();
          }
          const mixed = await sharp(baseBytes)
            .resize(width, height, { fit: "fill" })
            .composite([{ input: fgInput, blend: "over" }])
            .png()
            .toBuffer();
          return { output: toBase64Ref(mixed, baseObj) };
        }
      }

      if (t.includes(".draw.RenderText")) {
        const text = String((this as any).text ?? "");
        if (!text) {
          return { output: toBase64Ref(baseBytes, baseObj) };
        }
        const x = num((this as any).x, 0);
        const y = num((this as any).y, 0);
        const size = Math.min(512, Math.max(1, num((this as any).size, 12)));
        const colorVal = (this as any).color ?? "#000000";
        const color =
          colorVal &&
          typeof colorVal === "object" &&
          "value" in (colorVal as object)
            ? String((colorVal as Record<string, unknown>).value)
            : String(colorVal as string);
        const fontVal = (this as any).font;
        const fontFamily =
          fontVal &&
          typeof fontVal === "object" &&
          "name" in (fontVal as object)
            ? String((fontVal as Record<string, unknown>).name)
            : "sans-serif";
        const align = String((this as any).align ?? "left");

        if (!IS_NODE) {
          // Browser: rasterize the text onto the image with OffscreenCanvas.
          const bitmap = await createImageBitmap(
            new Blob([toArrayBuffer(baseBytes)])
          );
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) throw new Error("OffscreenCanvas 2D context unavailable");
          ctx.drawImage(bitmap, 0, 0);
          bitmap.close();
          ctx.font = `${size}px ${fontFamily}`;
          ctx.fillStyle = color;
          ctx.textAlign =
            align === "center" ? "center" : align === "right" ? "right" : "left";
          ctx.textBaseline = "alphabetic";
          ctx.fillText(text, x, y + size);
          const blob = await canvas.convertToBlob({ type: "image/png" });
          return {
            output: toBase64Ref(new Uint8Array(await blob.arrayBuffer()), baseObj)
          };
        }

        // Node: composite an SVG <text> over the image with sharp.
        const sharp = await loadSharp();
        if (!sharp) throw new Error(SHARP_UNAVAILABLE_MESSAGE);
        const textAnchor =
          align === "center" ? "middle" : align === "right" ? "end" : "start";
        const escapedText = escapeXmlAttr(text);
        const md = await sharp(baseBytes).metadata();
        const svgWidth = md.width ?? 512;
        const svgHeight = md.height ?? 512;
        // Every interpolated attribute is escaped — a quote in color/font would
        // otherwise break out of the attribute and inject SVG markup into sharp.
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}"><text x="${x}" y="${y + size}" font-size="${size}" fill="${escapeXmlAttr(color)}" font-family="${escapeXmlAttr(fontFamily)}" text-anchor="${escapeXmlAttr(textAnchor)}">${escapedText}</text></svg>`;
        const out = await sharp(baseBytes)
          .composite([{ input: Buffer.from(svg) }])
          .png()
          .toBuffer();
        return { output: toBase64Ref(out, baseObj) };
      }

      // Fallthrough (e.g. Mask with no foreground): pass the source through.
      return { output: toBase64Ref(baseBytes, baseObj) };
    }
  };

  for (const property of desc.properties) {
    registerDeclaredProperty(C, property.name, property.options);
  }

  return C as NodeClass;
}

const DESCRIPTORS: readonly Desc[] = [
  {
    nodeType: "lib.image.draw.Background",
    title: "Background",
    description:
      "The Background Node creates a blank background.\n    image, background, blank, base, layer\n    This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.\n\n    #### Applications\n    - As a base layer for creating composite images.\n    - As a starting point for generating patterns or graphics.\n    - When blank backgrounds of specific colors are required for visualization tasks.",
    inlineFields: [],
    inputFields:  [],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "width",
        options: {
          type: "int",
          default: 512,
          title: "Width",
          min: 1,
          max: 4096
        }
      },
      {
        name: "height",
        options: {
          type: "int",
          default: 512,
          title: "Height",
          min: 1,
          max: 4096
        }
      },
      {
        name: "color",
        options: {
          type: "color",
          default: {
            type: "color",
            value: "#FFFFFF"
          },
          title: "Color"
        }
      }
    ]
  },
  {
    nodeType: "lib.image.draw.GaussianNoise",
    title: "Gaussian Noise",
    description:
      "This node creates and adds Gaussian noise to an image.\n    image, noise, gaussian, distortion, artifact\n\n    The Gaussian Noise Node is designed to simulate realistic distortions that can occur in a photographic image. It generates a noise-filled image using the Gaussian (normal) distribution. The noise level can be adjusted using the mean and standard deviation parameters.\n\n    #### Applications\n    - Simulating sensor noise in synthetic data.\n    - Testing image-processing algorithms' resilience to noise.\n    - Creating artistic effects in images.",
    inlineFields: [],
    inputFields:  [],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "mean",
        options: {
          type: "float",
          default: 0,
          title: "Mean"
        }
      },
      {
        name: "stddev",
        options: {
          type: "float",
          default: 1,
          title: "Stddev"
        }
      },
      {
        name: "width",
        options: {
          type: "int",
          default: 512,
          title: "Width",
          min: 1,
          max: 1024
        }
      },
      {
        name: "height",
        options: {
          type: "int",
          default: 512,
          title: "Height",
          min: 1,
          max: 1024
        }
      }
    ]
  },
  {
    nodeType: "lib.image.draw.RenderText",
    title: "Render Text",
    description:
      "Draw text onto an image using a system-available font family.\n    text, font, label, title, watermark, caption, image, overlay\n\n    This node takes text, a font family name, coordinates (where to place the\n    text), and an image to work with. Use it to add a label or title to an\n    image, watermark an image, or place a caption directly on an image.\n\n    You can set the font family name, size, color, and alignment (left, center,\n    or right), and position the text anywhere on the image.\n\n    ### Fonts\n\n    Only the font's `name` is used, as a font-family name resolved against the\n    fonts available to the renderer (Canvas2D in the browser, sharp/librsvg on\n    the server). If the named family isn't available, the renderer falls back to\n    a default. The node does not download fonts, so the font's `source`, `url`,\n    and `weight` fields are ignored.\n\n    #### Applications\n    - Labeling images in an image gallery or database.\n    - Watermarking images for copyright protection.\n    - Adding custom captions to photographs.\n    - Creating instructional images to guide the reader's view.",
    inlineFields: ["text"],
    inputFields:  ["image"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "text",
        options: {
          type: "str",
          default: "",
          title: "Text",
          description: "The text to render."
        }
      },
      {
        name: "font",
        options: {
          type: "font",
          default: {
            type: "font",
            name: "DejaVuSans",
            source: "system",
            url: "",
            weight: "regular"
          },
          title: "Font",
          description:
            "The font family to use, resolved by name against the fonts available to the renderer. Only the font name is used; source, url, and weight are ignored."
        }
      },
      {
        name: "x",
        options: {
          type: "int",
          default: 0,
          title: "X",
          description: "The x coordinate."
        }
      },
      {
        name: "y",
        options: {
          type: "int",
          default: 0,
          title: "Y",
          description: "The y coordinate."
        }
      },
      {
        name: "size",
        options: {
          type: "int",
          default: 12,
          title: "Size",
          description: "The font size.",
          min: 1,
          max: 512
        }
      },
      {
        name: "color",
        options: {
          type: "color",
          default: {
            type: "color",
            value: "#000000"
          },
          title: "Color",
          description: "The font color."
        }
      },
      {
        name: "align",
        options: {
          type: "enum",
          default: "left",
          title: "Align",
          values: ["left", "center", "right"]
        }
      },
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
          description: "The image to render on."
        }
      }
    ]
  },
  {
    nodeType: "lib.image.Mask",
    title: "Mask",
    description:
      "Combine two images using a mask for advanced compositing.\n    composite, mask, blend, layering\n\n    Use cases:\n    - Create complex image compositions\n    - Apply selective blending or effects\n    - Implement advanced photo editing techniques",
    inlineFields: [],
    inputFields:  ["image1", "image2", "mask"],
    outputs: {
      output: "image"
    },
    properties: [
      {
        name: "image1",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image1",
          description: "The first image to composite."
        }
      },
      {
        name: "image2",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Image2",
          description: "The second image to composite."
        }
      },
      {
        name: "mask",
        options: {
          type: "image",
          default: {
            type: "image",
            uri: "",
            asset_id: null,
            data: null,
            metadata: null
          },
          title: "Mask",
          description: "The mask to composite with."
        }
      }
    ]
  }
] as const;

export const LIB_IMAGE_DRAW_NODES: readonly NodeClass[] = DESCRIPTORS.map(createDrawNode);
