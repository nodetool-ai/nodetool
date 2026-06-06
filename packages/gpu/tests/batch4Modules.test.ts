import { describe, it, expect } from "vitest";
import * as d from "typegpu/data";
import type { ShaderModule } from "../src/module.js";
import {
  mixerColorOverlayV1,
  mixerOutlineV1,
  mixerShadowComposeV1,
  mixerDropShadowV1,
  colorChannelSplitV1,
  colorChannelShuffleV1,
  colorChannelMergeV1
} from "../src/shaders/index.js";
import { createDefaultRegistry } from "../src/pool.js";

/**
 * Phase 3 Batch 4: mixer / layer-effect modules and the channel ops. Layer
 * effects (`colorOverlay`, `outline`, `dropShadow`, plus the internal
 * `shadowCompose` helper) live under `mixer/`. Channel ops (`channelSplit`,
 * `channelShuffle`, `channelMerge`) live under `color/` per the Phase 3
 * "channel ops live under color/" call-out.
 */
const FRAGMENT_MODULES: Array<{
  module: ShaderModule;
  id: string;
  category: string;
  inputCount: number;
}> = [
  {
    module: mixerColorOverlayV1,
    id: "mixer.colorOverlay",
    category: "mixer",
    inputCount: 1
  },
  { module: mixerOutlineV1, id: "mixer.outline", category: "mixer", inputCount: 1 },
  {
    module: mixerShadowComposeV1,
    id: "mixer.shadowCompose",
    category: "mixer",
    inputCount: 2
  },
  {
    module: colorChannelSplitV1,
    id: "color.channelSplit",
    category: "color",
    inputCount: 1
  },
  {
    module: colorChannelShuffleV1,
    id: "color.channelShuffle",
    category: "color",
    inputCount: 1
  },
  {
    module: colorChannelMergeV1,
    id: "color.channelMerge",
    category: "color",
    inputCount: 2
  }
];

describe("Phase 3 Batch 4 fragment modules", () => {
  for (const { module, id, category, inputCount } of FRAGMENT_MODULES) {
    describe(id, () => {
      it("is a fragment module in the right category at version 1", () => {
        expect(module.id).toBe(id);
        expect(module.version).toBe(1);
        expect(module.kind).toBe("fragment");
        expect(module.surface).toBe("internal");
        expect(module.category).toBe(category);
        expect(module.entryPoint).toBe("fs_main");
      });

      it("resolves WGSL with layout bindings injected (no `layout.$` left)", () => {
        expect(module.wgsl).not.toContain("layout.$");
        expect(module.wgsl).toContain("fn fs_main");
      });

      it(`declares ${inputCount} input(s) and emits an rgba8unorm output`, () => {
        const inputs = Object.keys(module.io.inputs);
        expect(inputs.length).toBe(inputCount);
        expect(module.io.output.format).toBe("rgba8unorm");
      });

      it("uniform schema fields appear in the resolved WGSL", () => {
        const fields = Object.keys(
          module.paramDefaults as Record<string, unknown>
        );
        for (const field of fields) {
          expect(module.wgsl).toContain(field);
        }
      });

      it("uniform schema packs to a non-zero size", () => {
        expect(d.sizeOf(module.params)).toBeGreaterThan(0);
      });
    });
  }

  it("mixer.colorOverlay default mid-amount red overlay", () => {
    expect(mixerColorOverlayV1.paramDefaults.amount).toBe(0.5);
    // Pre-multiplied is the pool convention but the param is straight; the
    // shader does the multiply.
    expect(mixerColorOverlayV1.paramDefaults.color).toEqual(d.vec4f(1, 0, 0, 1));
  });

  it("mixer.outline default is a 2-pixel opaque-black ring at threshold=0.5", () => {
    expect(mixerOutlineV1.paramDefaults.widthPx).toBe(2);
    expect(mixerOutlineV1.paramDefaults.threshold).toBe(0.5);
    expect(mixerOutlineV1.paramDefaults.color).toEqual(d.vec4f(0, 0, 0, 1));
  });

  it("mixer.shadowCompose binds source + shadowMask", () => {
    const inputs = Object.keys(mixerShadowComposeV1.io.inputs).sort();
    expect(inputs).toEqual(["shadowMask", "source"]);
  });

  it("color.channelShuffle defaults to identity permutation", () => {
    expect(colorChannelShuffleV1.paramDefaults).toEqual({
      rFrom: 0,
      gFrom: 1,
      bFrom: 2,
      aFrom: 3
    });
  });

  it("color.channelSplit defaults to red channel (mode = 0)", () => {
    expect(colorChannelSplitV1.paramDefaults.mode).toBe(0);
  });

  it("color.channelMerge binds source + alpha and defaults to alpha-from-alpha", () => {
    expect(Object.keys(colorChannelMergeV1.io.inputs).sort()).toEqual([
      "alpha",
      "source"
    ]);
    expect(colorChannelMergeV1.paramDefaults.alphaChannel).toBe(3);
  });
});

describe("mixer.dropShadow recipe", () => {
  it("is a recipe-kind catalog entry under mixer", () => {
    expect(mixerDropShadowV1.id).toBe("mixer.dropShadow");
    expect(mixerDropShadowV1.version).toBe(1);
    expect(mixerDropShadowV1.kind).toBe("recipe");
    expect(mixerDropShadowV1.surface).toBe("internal");
    expect(mixerDropShadowV1.category).toBe("mixer");
  });

  it("declares three intermediates and a 4-pass DAG", () => {
    const { intermediates, passes } = mixerDropShadowV1.recipe;
    expect(Object.keys(intermediates).sort()).toEqual(["blurH", "blurV", "mask"]);
    expect(passes).toHaveLength(4);
    expect(passes[0].op.id).toBe("mask.fromImage");
    expect(passes[1].op.id).toBe("filters.blur.gaussian");
    expect(passes[2].op.id).toBe("filters.blur.gaussian");
    expect(passes[3].op.id).toBe("mixer.shadowCompose");
    expect(passes[3].out).toBe("output");
  });

  it("declares RoD expanding by the blur radius", () => {
    expect(mixerDropShadowV1.io.rod).toBe("expand:radius");
  });

  it("every referenced op resolves from the default registry", () => {
    const registry = createDefaultRegistry();
    for (const pass of mixerDropShadowV1.recipe.passes) {
      expect(registry.has(pass.op)).toBe(true);
    }
  });

  it("blur passes use the recipe's radius and the canonical (1,0)/(0,1) directions", () => {
    const passes = mixerDropShadowV1.recipe.passes;
    expect(passes[1].params.radius).toBe("$.radius");
    expect(passes[2].params.radius).toBe("$.radius");
    // directions are literal vec2f, not param refs
    expect(typeof passes[1].params.direction).not.toBe("string");
    expect(typeof passes[2].params.direction).not.toBe("string");
  });
});
