import { BaseNode, prop } from "@nodetool-ai/node-sdk";

type SvgElementLike = {
  name: string;
  attributes?: Record<string, string>;
  children?: SvgElementLike[];
  content?: string;
};

function asColor(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in (value as object)) {
    return String((value as { value?: unknown }).value ?? fallback);
  }
  return fallback;
}

function elementToString(el: SvgElementLike): string {
  const attrs = Object.entries(el.attributes ?? {})
    .map(([k, v]) => `${k}="${String(v).replaceAll('"', "&quot;")}"`)
    .join(" ");
  const open = attrs ? `<${el.name} ${attrs}>` : `<${el.name}>`;
  const children = (el.children ?? []).map(elementToString).join("");
  const content = el.content ?? "";
  return `${open}${content}${children}</${el.name}>`;
}

function svgDocument(
  content: string,
  width: number,
  height: number,
  viewBox: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${viewBox}">${content}</svg>`;
}

function normalizeContent(content: unknown): string {
  if (Array.isArray(content)) {
    return content.map((c) => normalizeContent(c)).join("\n");
  }
  if (content && typeof content === "object" && "name" in (content as object)) {
    return elementToString(content as SvgElementLike);
  }
  return String(content ?? "");
}

export class RectLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Rect";
  static readonly title = "Rectangle";
  static readonly description =
    "Generate SVG rectangle element with customizable position, size, and styling.\n    svg, shape, vector, rectangle\n\n    Use cases:\n    - Create rectangular shapes in SVG documents\n    - Design borders, frames, and backgrounds\n    - Build user interface components\n    - Create geometric patterns and layouts";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({ type: "int", default: 0, title: "X", description: "X coordinate" })
  declare x: any;

  @prop({ type: "int", default: 0, title: "Y", description: "Y coordinate" })
  declare y: any;

  @prop({ type: "int", default: 100, title: "Width", description: "Width" })
  declare width: any;

  @prop({ type: "int", default: 100, title: "Height", description: "Height" })
  declare height: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Fill color"
  })
  declare fill: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "none"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "rect",
        attributes: {
          x: String(this.x ?? 0),
          y: String(this.y ?? 0),
          width: String(this.width ?? 100),
          height: String(this.height ?? 100),
          fill: asColor(this.fill, "#000000"),
          stroke: asColor(this.stroke, "none"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class CircleLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Circle";
  static readonly title = "Circle";
  static readonly description =
    "Generate SVG circle element with customizable position, radius, and styling.\n    svg, shape, vector, circle\n\n    Use cases:\n    - Create circular shapes and icons\n    - Design buttons, badges, and indicators\n    - Build data visualizations like pie charts\n    - Create decorative elements and patterns";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "int",
    default: 0,
    title: "Cx",
    description: "Center X coordinate"
  })
  declare cx: any;

  @prop({
    type: "int",
    default: 0,
    title: "Cy",
    description: "Center Y coordinate"
  })
  declare cy: any;

  @prop({ type: "int", default: 50, title: "Radius", description: "Radius" })
  declare radius: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Fill color"
  })
  declare fill: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "none"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "circle",
        attributes: {
          cx: String(this.cx ?? 0),
          cy: String(this.cy ?? 0),
          r: String(this.radius ?? 50),
          fill: asColor(this.fill, "#000000"),
          stroke: asColor(this.stroke, "none"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class EllipseLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Ellipse";
  static readonly title = "Ellipse";
  static readonly description =
    "Generate SVG ellipse element with customizable position, radii, and styling.\n    svg, shape, vector, ellipse\n\n    Use cases:\n    - Create oval shapes and organic forms\n    - Design speech bubbles and callouts\n    - Build data visualization elements\n    - Create decorative patterns and borders";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "int",
    default: 0,
    title: "Cx",
    description: "Center X coordinate"
  })
  declare cx: any;

  @prop({
    type: "int",
    default: 0,
    title: "Cy",
    description: "Center Y coordinate"
  })
  declare cy: any;

  @prop({ type: "int", default: 100, title: "Rx", description: "X radius" })
  declare rx: any;

  @prop({ type: "int", default: 50, title: "Ry", description: "Y radius" })
  declare ry: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Fill color"
  })
  declare fill: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "none"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "ellipse",
        attributes: {
          cx: String(this.cx ?? 0),
          cy: String(this.cy ?? 0),
          rx: String(this.rx ?? 100),
          ry: String(this.ry ?? 50),
          fill: asColor(this.fill, "#000000"),
          stroke: asColor(this.stroke, "none"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class LineLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Line";
  static readonly title = "Line";
  static readonly description =
    "Generate SVG line element with customizable endpoints and styling.\n    svg, shape, vector, line\n\n    Use cases:\n    - Draw straight lines and connectors\n    - Create dividers and separators\n    - Build diagrams and flowcharts\n    - Design grid patterns and borders";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "int",
    default: 0,
    title: "X1",
    description: "Start X coordinate"
  })
  declare x1: any;

  @prop({
    type: "int",
    default: 0,
    title: "Y1",
    description: "Start Y coordinate"
  })
  declare y1: any;

  @prop({
    type: "int",
    default: 100,
    title: "X2",
    description: "End X coordinate"
  })
  declare x2: any;

  @prop({
    type: "int",
    default: 100,
    title: "Y2",
    description: "End Y coordinate"
  })
  declare y2: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "line",
        attributes: {
          x1: String(this.x1 ?? 0),
          y1: String(this.y1 ?? 0),
          x2: String(this.x2 ?? 100),
          y2: String(this.y2 ?? 100),
          stroke: asColor(this.stroke, "#000000"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class PolygonLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Polygon";
  static readonly title = "Polygon";
  static readonly description =
    "Generate SVG polygon element with multiple vertices.\n    svg, shape, vector, polygon\n\n    Use cases:\n    - Create multi-sided shapes like triangles, pentagons, stars\n    - Build custom icons and symbols\n    - Design complex geometric patterns\n    - Create irregular shapes and forms";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "str",
    default: "",
    title: "Points",
    description: "Points in format 'x1,y1 x2,y2 x3,y3...'"
  })
  declare points: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Fill color"
  })
  declare fill: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "none"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "polygon",
        attributes: {
          points: String(this.points ?? ""),
          fill: asColor(this.fill, "#000000"),
          stroke: asColor(this.stroke, "none"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class PathLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Path";
  static readonly title = "Path";
  static readonly description =
    "Generate SVG path element using path data commands.\n    svg, shape, vector, path\n\n    Use cases:\n    - Create complex curved and custom shapes\n    - Build logos and custom icons\n    - Design intricate patterns and illustrations\n    - Import path data from design tools";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path Data",
    description: "SVG path data (d attribute)"
  })
  declare path_data: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Fill color"
  })
  declare fill: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "none"
    },
    title: "Stroke",
    description: "Stroke color"
  })
  declare stroke: any;

  @prop({
    type: "int",
    default: 1,
    title: "Stroke Width",
    description: "Stroke width"
  })
  declare stroke_width: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "path",
        attributes: {
          d: String(this.path_data ?? ""),
          fill: asColor(this.fill, "#000000"),
          stroke: asColor(this.stroke, "none"),
          "stroke-width": String(this.stroke_width ?? 1)
        }
      }
    };
  }
}

export class TextLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Text";
  static readonly title = "Text";
  static readonly description =
    "Add text elements to SVG.\n    svg, text, typography\n\n    Use cases:\n    - Add labels to vector graphics\n    - Create text-based logos\n    - Generate dynamic text content in SVGs";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "str",
    default: "",
    title: "Text",
    description: "Text content"
  })
  declare text: any;

  @prop({ type: "int", default: 0, title: "X", description: "X coordinate" })
  declare x: any;

  @prop({ type: "int", default: 0, title: "Y", description: "Y coordinate" })
  declare y: any;

  @prop({
    type: "str",
    default: "Arial",
    title: "Font Family",
    description: "Font family"
  })
  declare font_family: any;

  @prop({
    type: "int",
    default: 16,
    title: "Font Size",
    description: "Font size"
  })
  declare font_size: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Fill",
    description: "Text color"
  })
  declare fill: any;

  @prop({
    type: "enum",
    default: "start",
    title: "Text Anchor",
    description: "Text anchor position",
    values: ["start", "middle", "end"]
  })
  declare text_anchor: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "text",
        attributes: {
          x: String(this.x ?? 0),
          y: String(this.y ?? 0),
          "font-family": String(this.font_family ?? "Arial"),
          "font-size": String(this.font_size ?? 16),
          fill: asColor(this.fill, "#000000"),
          "text-anchor": String(this.text_anchor ?? "start")
        },
        content: String(this.text ?? "")
      }
    };
  }
}

export class GaussianBlurLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.GaussianBlur";
  static readonly title = "Gaussian Blur";
  static readonly description =
    "Apply Gaussian blur filter effect to SVG elements.\n    svg, filter, blur, effects\n\n    Use cases:\n    - Create soft focus and depth effects\n    - Add subtle shadows and glows\n    - Simulate motion blur\n    - Soften edges in graphics";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "float",
    default: 3,
    title: "Std Deviation",
    description: "Standard deviation for blur"
  })
  declare std_deviation: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "filter",
        attributes: { id: "filter_gaussian_blur" },
        children: [
          {
            name: "feGaussianBlur",
            attributes: { stdDeviation: String(this.std_deviation ?? 3) }
          }
        ]
      }
    };
  }
}

export class DropShadowLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.DropShadow";
  static readonly title = "Drop Shadow";
  static readonly description =
    "Apply drop shadow filter effect to SVG elements for depth.\n    svg, filter, shadow, effects\n\n    Use cases:\n    - Add depth and elevation to elements\n    - Create realistic shadow effects\n    - Enhance visual hierarchy\n    - Improve element separation and readability";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "float",
    default: 3,
    title: "Std Deviation",
    description: "Standard deviation for blur"
  })
  declare std_deviation: any;

  @prop({
    type: "int",
    default: 2,
    title: "Dx",
    description: "X offset for shadow"
  })
  declare dx: any;

  @prop({
    type: "int",
    default: 2,
    title: "Dy",
    description: "Y offset for shadow"
  })
  declare dy: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Color",
    description: "Color for shadow"
  })
  declare color: any;

  async process(): Promise<Record<string, unknown>> {
    return {
      output: {
        name: "filter",
        attributes: { id: "filter_drop_shadow" },
        children: [
          {
            name: "feGaussianBlur",
            attributes: {
              in: "SourceAlpha",
              stdDeviation: String(this.std_deviation ?? 3)
            }
          },
          {
            name: "feOffset",
            attributes: { dx: String(this.dx ?? 2), dy: String(this.dy ?? 2) }
          },
          {
            name: "feFlood",
            attributes: { "flood-color": asColor(this.color, "#000000") }
          },
          {
            name: "feComposite",
            attributes: { operator: "in", in2: "SourceAlpha" }
          },
          {
            name: "feMerge",
            children: [
              { name: "feMergeNode" },
              { name: "feMergeNode", attributes: { in: "SourceGraphic" } }
            ]
          }
        ]
      }
    };
  }
}

export class DocumentLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Document";
  static readonly title = "SVG Document";
  static readonly description =
    "Combine SVG elements into a complete SVG document.\n    svg, document, combine\n\n    Use cases:\n    - Combine multiple SVG elements into a single document\n    - Set document-level properties like viewBox and dimensions\n    - Export complete SVG documents";
  static readonly metadataOutputTypes = {
    output: "svg"
  };

  @prop({
    type: "list[svg_element]",
    default: [],
    title: "Elements",
    description: "List of SVG elements"
  })
  declare elements: any;

  @prop({
    type: "int",
    default: 800,
    title: "Width",
    description: "Document width",
    min: 1,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 600,
    title: "Height",
    description: "Document height",
    min: 1,
    max: 4096
  })
  declare height: any;

  @prop({
    type: "str",
    default: "0 0 800 600",
    title: "Viewbox",
    description: "SVG viewBox attribute"
  })
  declare viewBox: any;

  async process(): Promise<Record<string, unknown>> {
    const content = normalizeContent(this.elements ?? []);
    const width = Number(this.width ?? 800);
    const height = Number(this.height ?? 600);
    const viewBox = String(this.viewBox ?? "0 0 800 600");
    const doc = svgDocument(content, width, height, viewBox);
    return { output: { data: Buffer.from(doc, "utf-8").toString("base64") } };
  }
}

export class SVGToImageLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.SVGToImage";
  static readonly title = "SVG to Image";
  static readonly description =
    "Create an SVG document and convert it to a raster image in one step.\n    svg, document, raster, convert\n\n    Use cases:\n    - Create and rasterize SVG documents in a single operation\n    - Generate image files from SVG elements\n    - Convert vector graphics to bitmap format with custom dimensions";
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "list[svg_element]",
    default: [],
    title: "Elements",
    description: "List of SVG elements"
  })
  declare elements: any;

  @prop({
    type: "int",
    default: 800,
    title: "Width",
    description: "Document width",
    min: 1,
    max: 4096
  })
  declare width: any;

  @prop({
    type: "int",
    default: 600,
    title: "Height",
    description: "Document height",
    min: 1,
    max: 4096
  })
  declare height: any;

  @prop({
    type: "str",
    default: "0 0 800 600",
    title: "Viewbox",
    description: "SVG viewBox attribute"
  })
  declare viewBox: any;

  @prop({
    type: "int",
    default: 1,
    title: "Scale",
    description: "Scale factor for rasterization",
    min: 1,
    max: 10
  })
  declare scale: any;

  async process(): Promise<Record<string, unknown>> {
    const sharp = (await import("sharp")).default;
    const content = normalizeContent(this.elements ?? []);
    const width = Number(this.width ?? 800);
    const height = Number(this.height ?? 600);
    const scale = Number(this.scale ?? 1);
    const viewBox = String(this.viewBox ?? "0 0 800 600");
    const doc = svgDocument(content, width, height, viewBox);
    const svgBuffer = Buffer.from(doc, "utf-8");
    const pngBuffer = await sharp(svgBuffer, { density: 72 * scale })
      .resize(width * scale, height * scale)
      .png()
      .toBuffer();
    return {
      output: {
        type: "image",
        data: pngBuffer.toString("base64"),
        mimeType: "image/png",
        width: width * scale,
        height: height * scale
      }
    };
  }
}

export class GradientLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Gradient";
  static readonly title = "Gradient";
  static readonly description =
    "Create linear or radial gradients for SVG elements.\n    svg, gradient, color\n\n    Use cases:\n    - Add smooth color transitions\n    - Create complex color effects\n    - Define reusable gradient definitions";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "enum",
    default: "linearGradient",
    title: "Gradient Type",
    description: "Type of gradient",
    values: ["linearGradient", "radialGradient"]
  })
  declare gradient_type: any;

  @prop({
    type: "float",
    default: 0,
    title: "X1",
    description: "Start X position (linear) or center X (radial)"
  })
  declare x1: any;

  @prop({
    type: "float",
    default: 0,
    title: "Y1",
    description: "Start Y position (linear) or center Y (radial)"
  })
  declare y1: any;

  @prop({
    type: "float",
    default: 100,
    title: "X2",
    description: "End X position (linear) or radius X (radial)"
  })
  declare x2: any;

  @prop({
    type: "float",
    default: 100,
    title: "Y2",
    description: "End Y position (linear) or radius Y (radial)"
  })
  declare y2: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#000000"
    },
    title: "Color1",
    description: "Start color of gradient"
  })
  declare color1: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#FFFFFF"
    },
    title: "Color2",
    description: "End color of gradient"
  })
  declare color2: any;

  async process(): Promise<Record<string, unknown>> {
    const gradientType = String(this.gradient_type ?? "linearGradient");
    const attrs: Record<string, string> = { id: `gradient_${gradientType}` };
    if (gradientType === "linearGradient") {
      attrs.x1 = `${String(this.x1 ?? 0)}%`;
      attrs.y1 = `${String(this.y1 ?? 0)}%`;
      attrs.x2 = `${String(this.x2 ?? 100)}%`;
      attrs.y2 = `${String(this.y2 ?? 100)}%`;
    } else {
      attrs.cx = `${String(this.x1 ?? 0)}%`;
      attrs.cy = `${String(this.y1 ?? 0)}%`;
      attrs.r = `${String(this.x2 ?? 100)}%`;
    }
    return {
      output: {
        name: gradientType,
        attributes: attrs,
        children: [
          {
            name: "stop",
            attributes: {
              offset: "0%",
              style: `stop-color:${asColor(this.color1, "#000000")};stop-opacity:1`
            }
          },
          {
            name: "stop",
            attributes: {
              offset: "100%",
              style: `stop-color:${asColor(this.color2, "#FFFFFF")};stop-opacity:1`
            }
          }
        ]
      }
    };
  }
}

export class TransformLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.Transform";
  static readonly title = "Transform";
  static readonly description =
    "Apply transformations to SVG elements.\n    svg, transform, animation\n\n    Use cases:\n    - Rotate, scale, or translate elements\n    - Create complex transformations\n    - Prepare elements for animation";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "svg_element",
    default: {
      type: "svg_element",
      name: "",
      attributes: {},
      content: null,
      children: []
    },
    title: "Content",
    description: "SVG element to transform"
  })
  declare content: any;

  @prop({
    type: "float",
    default: 0,
    title: "Translate X",
    description: "X translation"
  })
  declare translate_x: any;

  @prop({
    type: "float",
    default: 0,
    title: "Translate Y",
    description: "Y translation"
  })
  declare translate_y: any;

  @prop({
    type: "float",
    default: 0,
    title: "Rotate",
    description: "Rotation angle in degrees"
  })
  declare rotate: any;

  @prop({
    type: "float",
    default: 1,
    title: "Scale X",
    description: "X scale factor"
  })
  declare scale_x: any;

  @prop({
    type: "float",
    default: 1,
    title: "Scale Y",
    description: "Y scale factor"
  })
  declare scale_y: any;

  async process(): Promise<Record<string, unknown>> {
    const content = { ...((this.content ?? {}) as SvgElementLike) };
    if (!content || typeof content !== "object" || !("name" in content)) {
      return { output: { name: "g", attributes: {}, children: [] } };
    }
    const transforms: string[] = [];
    const tx = Number(this.translate_x ?? 0);
    const ty = Number(this.translate_y ?? 0);
    const rotate = Number(this.rotate ?? 0);
    const sx = Number(this.scale_x ?? 1);
    const sy = Number(this.scale_y ?? 1);
    if (tx !== 0 || ty !== 0) transforms.push(`translate(${tx},${ty})`);
    if (rotate !== 0) transforms.push(`rotate(${rotate})`);
    if (sx !== 1 || sy !== 1) transforms.push(`scale(${sx},${sy})`);

    if (transforms.length > 0) {
      content.attributes = {
        ...(content.attributes ?? {}),
        transform: transforms.join(" ")
      };
    }
    return { output: content };
  }
}

export class ClipPathLibNode extends BaseNode {
  static readonly nodeType = "lib.svg.ClipPath";
  static readonly title = "Clip Path";
  static readonly description =
    "Create clipping paths for SVG elements.\n    svg, clip, mask\n\n    Use cases:\n    - Mask parts of elements\n    - Create complex shapes through clipping\n    - Apply visual effects using masks";
  static readonly metadataOutputTypes = {
    output: "svg_element"
  };

  @prop({
    type: "svg_element",
    default: {
      type: "svg_element",
      name: "",
      attributes: {},
      content: null,
      children: []
    },
    title: "Clip Content",
    description: "SVG element to use as clip path"
  })
  declare clip_content: any;

  @prop({
    type: "svg_element",
    default: {
      type: "svg_element",
      name: "",
      attributes: {},
      content: null,
      children: []
    },
    title: "Content",
    description: "SVG element to clip"
  })
  declare content: any;

  async process(): Promise<Record<string, unknown>> {
    const clipContent = (this.clip_content ?? {}) as SvgElementLike;
    const content = { ...((this.content ?? {}) as SvgElementLike) };
    if (!clipContent || !content || !clipContent.name || !content.name) {
      return { output: { name: "g", attributes: {}, children: [] } };
    }
    const clipId = `clip_path_${Date.now()}`;
    content.attributes = {
      ...(content.attributes ?? {}),
      "clip-path": `url(#${clipId})`
    };
    return {
      output: {
        name: "g",
        children: [
          {
            name: "clipPath",
            attributes: { id: clipId },
            children: [clipContent]
          },
          content
        ]
      }
    };
  }
}

export const LIB_SVG_NODES = [
  RectLibNode,
  CircleLibNode,
  EllipseLibNode,
  LineLibNode,
  PolygonLibNode,
  PathLibNode,
  TextLibNode,
  GaussianBlurLibNode,
  DropShadowLibNode,
  DocumentLibNode,
  SVGToImageLibNode,
  GradientLibNode,
  TransformLibNode,
  ClipPathLibNode
] as const;
