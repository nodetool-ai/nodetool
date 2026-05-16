/**
 * Smoke tests for the GPU shader registry.
 *
 * Covers:
 *   • listShaders returns a fresh array
 *   • AND-combined filter logic
 *   • getShader throws on unknown id
 *   • ALL_SHADERS is empty in Phase 1
 */

import {
  getShader,
  listShaders,
  type ShaderModule,
  type ShaderFilter,
} from "../registry.js";
import { ALL_SHADERS } from "../shaders/index.js";

describe("GPU shader registry", () => {
  test("ALL_SHADERS is empty in Phase 1", () => {
    expect(ALL_SHADERS).toHaveLength(0);
  });

  test("listShaders returns a fresh array", () => {
    const a = listShaders();
    const b = listShaders();
    expect(a).toEqual([]);
    expect(b).toEqual([]);
    expect(a).not.toBe(b);
  });

  test("getShader throws on unknown id", () => {
    expect(() => getShader("nonexistent/shader")).toThrow(
      'Shader not found: "nonexistent/shader"'
    );
  });

  test("listShaders with no filter returns all shaders", () => {
    const result = listShaders();
    expect(result).toHaveLength(0);
  });

  test("listShaders AND-combines filter fields", () => {
    // Inject a temporary catalog to exercise filtering without mutating the real one.
    const catalog = ALL_SHADERS as ShaderModule[];
    const originals = [...catalog];

    const dummyA: ShaderModule = {
      id: "mixer/composite",
      kind: "fragment",
      category: "mixer",
      surface: "internal",
      variant: "default",
      scope: "render",
      wgsl: "",
    };
    const dummyB: ShaderModule = {
      id: "mixer/composite:fast",
      kind: "fragment",
      category: "mixer",
      surface: "internal",
      variant: "fast",
      scope: "render",
      wgsl: "",
    };
    const dummyC: ShaderModule = {
      id: "backgrounds/checkerboard",
      kind: "fragment",
      category: "backgrounds",
      surface: "internal",
      variant: "default",
      scope: "render",
      wgsl: "",
    };

    catalog.push(dummyA, dummyB, dummyC);

    try {
      expect(listShaders()).toHaveLength(3);

      const byCategory: ShaderFilter = { category: "mixer" };
      expect(listShaders(byCategory)).toEqual([dummyA, dummyB]);

      const byVariant: ShaderFilter = { variant: "fast" };
      expect(listShaders(byVariant)).toEqual([dummyB]);

      const byKindAndCategory: ShaderFilter = { kind: "fragment", category: "mixer" };
      expect(listShaders(byKindAndCategory)).toEqual([dummyA, dummyB]);

      const mismatch: ShaderFilter = { kind: "fragment", category: "overlays" };
      expect(listShaders(mismatch)).toEqual([]);
    } finally {
      // Restore original empty catalog
      catalog.length = 0;
      catalog.push(...originals);
    }
  });
});
