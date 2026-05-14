/**
 * Explicit shader catalog barrel.
 *
 * This array is imported by the registry and consumed by `getShader()` / `listShaders()`.
 * Do NOT use `import.meta.glob` — add entries here manually as shaders are migrated.
 */

import type { ShaderModule } from "../registry.js";

/**
 * Complete catalog of registered shader modules.
 *
 * Starts empty in Phase 1; populated incrementally as shaders are moved into
 * `utils/`, `mixer/`, `backgrounds/`, and `overlays/` in later tasks.
 */
export const ALL_SHADERS: readonly ShaderModule[] = [];
