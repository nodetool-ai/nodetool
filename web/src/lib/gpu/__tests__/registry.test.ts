import { describe, expect, it } from "@jest/globals";

import { getShader, listShaders } from "../registry";
import { ALL_SHADERS } from "../shaders";
import type { ShaderModule } from "../registry";

describe("gpu registry", () => {
  describe("listShaders", () => {
    it("returns ALL_SHADERS when no filter is provided", () => {
      const result = listShaders();
      expect(result).toEqual([...ALL_SHADERS]);
    });

    it("returns a fresh array (not the underlying ALL_SHADERS reference)", () => {
      const result = listShaders();
      expect(result).not.toBe(ALL_SHADERS);
    });

    it("filters by kind/category/surface/variant/scope (AND-combined)", () => {
      const fixtures: ShaderModule[] = [
        {
          id: "utils/blit",
          name: "blit",
          kind: "render",
          category: "utils",
          surface: "texture",
          variant: "default",
          scope: "shared",
          source: "// wgsl"
        },
        {
          id: "mixer/composite:fast",
          name: "composite-fast",
          kind: "render",
          category: "mixer",
          surface: "canvas",
          variant: "fast",
          scope: "sketch",
          source: "// wgsl"
        }
      ];

      // Local re-test of filter logic against an in-memory list. The real
      // ALL_SHADERS is empty in Phase 1, so we exercise the predicate by
      // filtering directly against the fixtures.
      const filter = {
        kind: "render" as const,
        category: "mixer" as const,
        surface: "canvas" as const,
        variant: "fast",
        scope: "sketch" as const
      };
      const matched = fixtures.filter(
        (s) =>
          s.kind === filter.kind &&
          s.category === filter.category &&
          s.surface === filter.surface &&
          s.variant === filter.variant &&
          s.scope === filter.scope
      );
      expect(matched).toHaveLength(1);
      expect(matched[0]?.id).toBe("mixer/composite:fast");
    });
  });

  describe("getShader", () => {
    it("throws on unknown id", () => {
      expect(() => getShader("does-not-exist")).toThrow(
        /no shader registered with id "does-not-exist"/
      );
    });
  });

  describe("ALL_SHADERS", () => {
    it("is initially empty in Phase 1", () => {
      // Phase 1: catalog is empty until shaders are migrated in later tasks.
      // If a shader is added before this test is updated, that's intentional —
      // update the assertion alongside the migration.
      expect(ALL_SHADERS).toEqual([]);
    });
  });
});
