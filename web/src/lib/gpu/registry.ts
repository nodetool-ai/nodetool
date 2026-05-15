/**
 * Shared GPU shader registry — types, metadata contracts, and lookup functions.
 *
 * ID naming convention:
 *   <category>/<name>           → default variant
 *   <category>/<name>:<variant> → named variant (e.g. "fast", "full")
 *
 * Phase-1 notes:
 *   • All entries are `surface: "internal"`.
 *   • `colorSpace` and `alphaMode` are descriptive only (no automatic conversion).
 *   • Snippets export plain WGSL strings and do NOT appear in `listShaders()`.
 */

// ─── Kinds ───────────────────────────────────────────────────────────────

/** Execution stage of a shader module. */
export type ShaderKind = "vertex" | "fragment" | "compute";

/** Logical group used for namespacing and UI filtering. */
export type ShaderCategory =
  | "utils"
  | "mixer"
  | "backgrounds"
  | "overlays"
  | string;

/** Visibility surface — "internal" for Phase 1. */
export type ShaderSurface = "internal" | "public" | string;

/**
 * Named quality/behaviour variant.
 *
 * Canonical values: "default", "fast", "full".
 * The `string` fallback allows future named variants without a registry change.
 */
export type ShaderVariant = "default" | "fast" | "full" | string;

/** Execution scope — whether the shader is a standalone pipeline stage or a snippet. */
export type ShaderScope = "render" | "compute" | "snippet" | string;

// ─── Module descriptor ───────────────────────────────────────────────────

export interface ShaderModule {
  /** Unique identifier following `<category>/<name>[:<variant>]` convention. */
  id: string;

  /** Vertex, fragment, or compute stage. */
  kind: ShaderKind;

  /** Logical namespace — must match the folder name under `shaders/`. */
  category: ShaderCategory;

  /** Visibility surface (descriptive). All Phase-1 entries are `"internal"`. */
  surface: ShaderSurface;

  /** Variant tag — `"default"` when omitted. */
  variant: ShaderVariant;

  /** Execution scope — `"render"`, `"compute"`, or `"snippet"`. */
  scope: ShaderScope;

  /** WGSL source string. */
  wgsl: string;

  /** Human-readable description (optional). */
  description?: string;

  /**
   * Descriptive color-space metadata.
   * Phase 1 does NOT perform automatic conversion.
   */
  colorSpace?: string;

  /**
   * Descriptive alpha-mode metadata (e.g. `"straight"`, `"premultiplied"`).
   * Phase 1 does NOT perform automatic conversion.
   */
  alphaMode?: string;
}

// ─── Filter ──────────────────────────────────────────────────────────────

export interface ShaderFilter {
  kind?: ShaderKind;
  category?: ShaderCategory;
  surface?: ShaderSurface;
  variant?: ShaderVariant;
  scope?: ShaderScope;
}

// ─── Catalog import ──────────────────────────────────────────────────────
//
// Explicit barrel — populated as shaders are migrated in later tasks.
// Do NOT replace with import.meta.glob.

import { ALL_SHADERS } from "./shaders/index.js";

// ─── Lookup API ──────────────────────────────────────────────────────────

/**
 * Retrieve a single shader by its exact ID.
 * @throws Error if the ID is not present in the catalog.
 */
export function getShader(id: string): ShaderModule {
  const found = ALL_SHADERS.find((s) => s.id === id);
  if (!found) {
    throw new Error(`Shader not found: "${id}"`);
  }
  return found;
}

/**
 * List shaders, optionally filtered.
 *
 * When `filter` is provided, every supplied property is AND-combined:
 * a shader must match *all* specified filter fields to be included.
 *
 * Returns a fresh array (safe to mutate by the caller).
 */
export function listShaders(filter?: ShaderFilter): ShaderModule[] {
  if (!filter) {
    return Array.from(ALL_SHADERS);
  }

  return ALL_SHADERS.filter((s) => {
    if (filter.kind !== undefined && s.kind !== filter.kind) return false;
    if (filter.category !== undefined && s.category !== filter.category)
      return false;
    if (filter.surface !== undefined && s.surface !== filter.surface)
      return false;
    if (filter.variant !== undefined && s.variant !== filter.variant)
      return false;
    if (filter.scope !== undefined && s.scope !== filter.scope) return false;
    return true;
  });
}
