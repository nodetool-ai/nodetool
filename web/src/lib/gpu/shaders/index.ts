/**
 * Explicit shader catalog.
 *
 * Every registered `ShaderModule` must be added to `ALL_SHADERS` below. We do
 * NOT use `import.meta.glob` — keep this list explicit so the catalog is
 * greppable and the bundle graph stays statically analysable.
 *
 * Snippets (plain WGSL string exports) should NOT be added here; they are
 * meant to be imported directly by composing shaders.
 *
 * This array starts empty in Phase 1 and gets populated as shaders are
 * migrated into `web/src/lib/gpu/shaders/{utils,mixer,backgrounds,overlays}/`.
 */

import type { ShaderModule } from "../registry";

export const ALL_SHADERS: readonly ShaderModule[] = [];
