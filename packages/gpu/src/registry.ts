/**
 * Shader registry — the lookup surface for `(id, version)` modules.
 *
 * Population is via an explicit barrel (`ALL_CATALOG`), not `import.meta.glob`:
 * Node-bundling-safe, grep-able, tree-shakeable. A module's identity is
 * `(id, version)`; registering the same pair twice is a programming error
 * and throws.
 *
 * From Phase 3 the registry stores both single-pass {@link ShaderModule}s and
 * multi-pass {@link RecipeModule}s under the same key space — they share the
 * `(id, version, surface, category)` identity. Consumers that only want
 * one kind can use the narrower `getShader` / `getRecipe` helpers.
 */

import type { ShaderModule } from "./module.js";
import { moduleKey } from "./module.js";
import type { RecipeModule } from "./recipe.js";
import type { ShaderCategory, ShaderSurface } from "./types.js";

/** Either kind of registry entry. Discriminated by `.kind`. */
export type AnyShader = ShaderModule | RecipeModule;

export interface ShaderQuery {
  id: string;
  /** Pin a version. Omit to resolve the highest registered version. */
  version?: number;
  /** Require a surface (e.g. `"published"` for workflow nodes). */
  surface?: ShaderSurface;
}

export interface ShaderListFilter {
  surface?: ShaderSurface;
  category?: ShaderCategory;
}

export class ShaderRegistry {
  private readonly byKey = new Map<string, AnyShader>();

  register(module: AnyShader): void {
    const key = moduleKey(module.id, module.version);
    if (this.byKey.has(key)) {
      throw new Error(`Shader module already registered: ${key}`);
    }
    this.byKey.set(key, module);
  }

  registerAll(modules: readonly AnyShader[]): void {
    for (const module of modules) {
      this.register(module);
    }
  }

  /** Resolve a module or `undefined`. Pins version when given; else latest. */
  tryGet(query: ShaderQuery): AnyShader | undefined {
    const candidate =
      query.version !== undefined
        ? this.byKey.get(moduleKey(query.id, query.version))
        : this.latest(query.id);
    if (!candidate) {
      return undefined;
    }
    if (query.surface && candidate.surface !== query.surface) {
      return undefined;
    }
    return candidate;
  }

  /**
   * Resolve a module or throw, naming the missing `(id, version)`. This is
   * the workflow-load failure mode: no silent fallback to another version.
   */
  get(query: ShaderQuery): AnyShader {
    const found = this.tryGet(query);
    if (!found) {
      const ver = query.version !== undefined ? `@${query.version}` : "";
      const surf = query.surface ? ` (surface=${query.surface})` : "";
      throw new Error(`Shader module not found: ${query.id}${ver}${surf}`);
    }
    return found;
  }

  /** Narrowed `get` for the Executor path; throws if the entry is a recipe. */
  getShader(query: ShaderQuery): ShaderModule {
    const entry = this.get(query);
    if (entry.kind === "recipe") {
      throw new Error(
        `Shader registry: ${entry.id}@${entry.version} is a recipe; use getRecipe or RecipeRunner`
      );
    }
    return entry as ShaderModule;
  }

  /** Narrowed `get` for the RecipeRunner path; throws if the entry is single-pass. */
  getRecipe(query: ShaderQuery): RecipeModule {
    const entry = this.get(query);
    if (entry.kind !== "recipe") {
      throw new Error(
        `Shader registry: ${entry.id}@${entry.version} is a single-pass module; use getShader or Executor`
      );
    }
    return entry;
  }

  has(query: ShaderQuery): boolean {
    return this.tryGet(query) !== undefined;
  }

  list(filter: ShaderListFilter = {}): AnyShader[] {
    const out: AnyShader[] = [];
    for (const module of this.byKey.values()) {
      if (filter.surface && module.surface !== filter.surface) {
        continue;
      }
      if (filter.category && module.category !== filter.category) {
        continue;
      }
      out.push(module);
    }
    return out;
  }

  private latest(id: string): AnyShader | undefined {
    let best: AnyShader | undefined;
    for (const module of this.byKey.values()) {
      if (module.id !== id) {
        continue;
      }
      if (!best || module.version > best.version) {
        best = module;
      }
    }
    return best;
  }
}
