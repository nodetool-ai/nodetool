/**
 * Explicit shader barrel. The registry is populated from `ALL_SHADERS` (not
 * `import.meta.glob`) so the catalog is Node-bundling-safe, grep-able, and
 * tree-shakeable. Every module added in later phases appends here.
 */

import type { ShaderModule } from "../module.js";
import { passthroughV1 } from "./_canary/passthrough/v1/module.js";

export { passthroughV1 };

export const ALL_SHADERS: readonly ShaderModule[] = [passthroughV1];
