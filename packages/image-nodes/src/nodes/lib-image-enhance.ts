import { BaseNode, registerDeclaredProperty } from "@nodetool-ai/node-sdk";
import type { NodeClass } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import * as d from "typegpu/data";
import { filtersConvolve3x3V1 } from "@nodetool-ai/gpu/pool";
import { pickImage } from "./lib-image-utils.js";
import { runShaderNode, type Desc } from "./lib-shader-utils.js";
import { decodeRgba, rawRgbaImageRef } from "./image-io.js";
import { tagAsBrowserGpu, tagAsContentCard } from "@nodetool-ai/nodes-utils";
import { loadKernels } from "@nodetool-ai/kernels";

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
      // a texture/RGBA ImageRef. The remaining ops are histogram, per-tile
      // and rank work that does not fit one shader pass (AutoContrast,
      // Equalize, AdaptiveContrast, RankFilter).
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

      // Histogram and neighbourhood ops run in the C++ kernel library
      // (@nodetool-ai/kernels) on the decoded straight-alpha RGBA: native in
      // the graph runner, WebAssembly on the server and in the browser. The
      // kernels process RGB, copy alpha, and write a new buffer, so `rgba`
      // (which may alias the upstream node's buffer) is never mutated.
      const { rgba, width: w, height: h } = await decodeRgba(baseObj, context);
      if (!w || !h) return { output: baseObj ?? {} };
      const kernels = await loadKernels();

      if (t.endsWith(".AutoContrast")) {
        const cutoff = Number((this as any).cutoff ?? 0);
        return {
          output: rawRgbaImageRef(kernels.imageAutoContrast(rgba, w, h, cutoff), w, h)
        };
      }

      if (t.endsWith(".Equalize")) {
        return { output: rawRgbaImageRef(kernels.imageEqualize(rgba, w, h), w, h) };
      }

      if (t.endsWith(".AdaptiveContrast")) {
        const clipLimit = Number((this as any).clip_limit ?? 2);
        // Clamped to the declared 1..64 range.
        const gridSize = Math.min(
          64,
          Math.max(1, Math.round(Number((this as any).grid_size ?? 8)))
        );
        return {
          output: rawRgbaImageRef(
            kernels.imageAdaptiveContrast(rgba, w, h, clipLimit, gridSize),
            w,
            h
          )
        };
      }

      if (t.endsWith(".RankFilter")) {
        // A window of at most 25 matches typical PIL RankFilter usage and
        // bounds the per-pixel cost.
        const size = Math.max(1, Math.min(25, Math.floor(Number((this as any).size ?? 3))));
        const rank = Math.max(0, Math.floor(Number((this as any).rank ?? 3)));
        return {
          output: rawRgbaImageRef(kernels.imageRankFilter(rgba, w, h, size, rank), w, h)
        };
      }

      // Unknown enhance type — pass the source through unchanged.
      return { output: rawRgbaImageRef(rgba, w, h) };
    }
  };

  for (const property of desc.properties) {
    registerDeclaredProperty(C, property.name, property.options);
  }

  return C;
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
