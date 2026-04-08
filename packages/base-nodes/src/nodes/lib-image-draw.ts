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

function createDrawNode(desc: Desc): NodeClass {
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

      if (t === "lib.image.draw.Background") {
        const width = Number((this as any).width ?? 512);
        const height = Number((this as any).height ?? 512);
        const colorVal = (this as any).color ?? "#FFFFFF";
        const color =
          colorVal &&
          typeof colorVal === "object" &&
          "value" in (colorVal as object)
            ? String((colorVal as Record<string, unknown>).value)
            : String(colorVal as string);
        const buf = await sharp({
          create: {
            width: Math.max(1, width),
            height: Math.max(1, height),
            channels: 4,
            background: color
          }
        })
          .png()
          .toBuffer();
        return { output: { type: "image", data: buf.toString("base64") } };
      }

      const baseObj = pickImage(
        this.serialize(),
        (
          this as unknown as { serialize(): Record<string, unknown> }
        ).serialize()
      );
      const baseBytes = await decodeImage(baseObj, context);
      if (!baseBytes) {
        return { output: baseObj ?? {} };
      }

      let img = sharp(baseBytes, { failOn: "none" });

      if (t === "lib.image.Blend") {
        const other = await decodeImage((this as any).image2, context);
        if (other) {
          const alpha = Number((this as any).alpha ?? 0.5);
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

      if (t === "lib.image.Composite") {
        const fg = await decodeImage(
          (this as any).foreground ??
            (this as unknown as Record<string, unknown>).foreground ??
            (this as any).image1 ??
            (this as unknown as Record<string, unknown>).image1,
          context
        );
        if (fg) {
          const mixed = await sharp(baseBytes)
            .composite([{ input: fg, blend: "over" }])
            .png()
            .toBuffer();
          return { output: toRef(mixed, baseObj) };
        }
      }

      if (t.includes(".draw.GaussianNoise")) {
        const md = await img.metadata();
        const w = md.width ?? 512;
        const h = md.height ?? 512;
        const noiseRaw = Buffer.alloc(w * h * 3);
        for (let i = 0; i < noiseRaw.length; i += 1) {
          noiseRaw[i] = Math.floor(Math.random() * 256);
        }
        const noise = await sharp(noiseRaw, {
          raw: { width: w, height: h, channels: 3 }
        })
          .png()
          .toBuffer();
        img = sharp(
          await sharp(baseBytes)
            .composite([{ input: noise, blend: "soft-light" }])
            .png()
            .toBuffer()
        );
      } else if (t.includes(".draw.RenderText")) {
        const text = String((this as any).text ?? "");
        if (text) {
          const svg = `<svg xmlns="http://www.w3.org/2000/svg"><text x="10" y="40" font-size="32" fill="white">${text
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")}</text></svg>`;
          img = sharp(
            await sharp(baseBytes)
              .composite([{ input: Buffer.from(svg) }])
              .png()
              .toBuffer()
          );
        }
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
    nodeType: "lib.image.draw.Background",
    title: "Background",
    description:
      "The Background Node creates a blank background.\n    image, background, blank, base, layer\n    This node is mainly used for generating a base layer for image processing tasks. It produces a uniform image, having a user-specified width, height and color. The color is given in a hexadecimal format, defaulting to white if not specified.\n\n    #### Applications\n    - As a base layer for creating composite images.\n    - As a starting point for generating patterns or graphics.\n    - When blank backgrounds of specific colors are required for visualization tasks.",
    basicFields: ["width", "height", "color"],
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
    basicFields: ["mean", "stddev", "width", "height"],
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
      'This node allows you to add text to images using system fonts or web fonts.\n    text, font, label, title, watermark, caption, image, overlay, google fonts\n\n    This node takes text, font updates, coordinates (where to place the text), and an image to work with.\n    A user can use the Render Text Node to add a label or title to an image, watermark an image,\n    or place a caption directly on an image.\n\n    The Render Text Node offers customizable options, including the ability to choose the text\'s font,\n    size, color, and alignment (left, center, or right). Text placement can also be defined,\n    providing flexibility to place the text wherever you see fit.\n\n    ### Font Sources\n\n    The node supports three font sources:\n\n    1. **System Fonts** (default): Use fonts installed on the system\n       - `FontRef(name="Arial")` - Uses local Arial font\n\n    2. **Google Fonts**: Automatically download and cache fonts from Google Fonts\n       - `FontRef(name="Roboto", source=FontSource.GOOGLE_FONTS)`\n       - `FontRef(name="Open Sans", source=FontSource.GOOGLE_FONTS, weight="bold")`\n       - Supports 50+ popular fonts including Roboto, Open Sans, Lato, Montserrat, Poppins, etc.\n\n    3. **Custom URL**: Download fonts from any URL\n       - `FontRef(name="CustomFont", source=FontSource.URL, url="https://example.com/font.ttf")`\n\n    #### Applications\n    - Labeling images in an image gallery or database.\n    - Watermarking images for copyright protection.\n    - Adding custom captions to photographs.\n    - Creating instructional images to guide the reader\'s view.\n    - Using premium Google Fonts for professional typography.',
    basicFields: ["text", "font", "x", "y", "size", "color", "align", "image"],
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
            "The font to use. Supports system fonts, Google Fonts, and custom URLs."
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
    nodeType: "lib.image.Blend",
    title: "Blend",
    description:
      "Blend two images with adjustable alpha mixing.\n    blend, mix, fade, transition\n\n    Use cases:\n    - Create smooth transitions between images\n    - Adjust opacity of overlays\n    - Combine multiple exposures or effects",
    basicFields: ["image1", "image2", "alpha"],
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
          description: "The first image to blend."
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
          description: "The second image to blend."
        }
      },
      {
        name: "alpha",
        options: {
          type: "float",
          default: 0.5,
          title: "Alpha",
          description: "The mix ratio.",
          min: 0,
          max: 1
        }
      }
    ]
  },
  {
    nodeType: "lib.image.Composite",
    title: "Composite",
    description:
      "Combine two images using a mask for advanced compositing.\n    composite, mask, blend, layering\n\n    Use cases:\n    - Create complex image compositions\n    - Apply selective blending or effects\n    - Implement advanced photo editing techniques",
    basicFields: ["image1", "image2", "mask"],
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

export const LIB_IMAGE_DRAW_NODES: readonly NodeClass[] =
  DESCRIPTORS.map(createDrawNode);
