/**
 * Explicit shader barrel. The registry is populated from `ALL_SHADERS` (not
 * `import.meta.glob`) so the catalog is Node-bundling-safe, grep-able, and
 * tree-shakeable. Every module added in later phases appends here.
 */

import type { ShaderModule } from "../module.js";
import { passthroughV1 } from "./_canary/passthrough/v1/module.js";
import { colorGradeV1 } from "./color/grade/v1/module.js";
import { blurGaussianV1 } from "./filters/blur/gaussian/v1/module.js";
import { sharpenUnsharpMaskV1 } from "./filters/sharpen/unsharpMask/v1/module.js";
import { vignetteV1 } from "./filters/vignette/v1/module.js";
import { chromaKeyV1 } from "./keyer/chromaKey/v1/module.js";

export {
  passthroughV1,
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1
};

export const ALL_SHADERS: readonly ShaderModule[] = [
  passthroughV1,
  colorGradeV1,
  blurGaussianV1,
  sharpenUnsharpMaskV1,
  vignetteV1,
  chromaKeyV1
];
