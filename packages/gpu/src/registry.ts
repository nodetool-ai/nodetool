/**
 * Shader registry — the lookup surface for `(id, version)` modules.
 *
 * Population is via an explicit barrel (`ALL_SHADERS`), not `import.meta.glob`:
 * Node-bundling-safe, grep-able, tree-shakeable. A module's identity is
 * `(id, version)`; registering the same pair twice is a programming error
 * and throws.
 */

import type { ShaderModule } from "./module.js";
import { moduleKey } from "./module.js";
import type { ShaderCategory, ShaderSurface } from "./types.js";

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
  private readonly byKey = new Map<string, ShaderModule>();

  register(module: ShaderModule): void {
    const key = moduleKey(module.id, module.version);
    if (this.byKey.has(key)) {
      throw new Error(`Shader module already registered: ${key}`);
    }
    this.byKey.set(key, module);
  }

  registerAll(modules: readonly ShaderModule[]): void {
    for (const module of modules) {
      this.register(module);
    }
  }

  /** Resolve a module or `undefined`. Pins version when given; else latest. */
  tryGet(query: ShaderQuery): ShaderModule | undefined {
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
  get(query: ShaderQuery): ShaderModule {
    const found = this.tryGet(query);
    if (!found) {
      const ver = query.version !== undefined ? `@${query.version}` : "";
      const surf = query.surface ? ` (surface=${query.surface})` : "";
      throw new Error(`Shader module not found: ${query.id}${ver}${surf}`);
    }
    return found;
  }

  has(query: ShaderQuery): boolean {
    return this.tryGet(query) !== undefined;
  }

  list(filter: ShaderListFilter = {}): ShaderModule[] {
    const out: ShaderModule[] = [];
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

  private latest(id: string): ShaderModule | undefined {
    let best: ShaderModule | undefined;
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
