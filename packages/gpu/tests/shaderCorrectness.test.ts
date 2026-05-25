/**
 * Shader correctness regression tests.
 *
 * Each block targets a bug found by the shader-correctness audit. The
 * assertions inspect WGSL source strings and module `io` declarations, so they
 * run on any host (no GPU required) and catch regressions if the buggy
 * patterns reappear.
 *
 * Audit findings covered (see `audit branch` description):
 *  1. Compositor blend math used premultiplied `dst` as `Cd` in the W3C
 *     formula (was double-darkening over semi-transparent backgrounds).
 *  2. `mask.apply` and `keyer.lumaKey` dropped alpha by `coverage` but left
 *     RGB at the original premultiplied value — violating the premul
 *     invariant `rgb ≤ α`.
 *  3. Color modules (`invert`, `brightnessContrast`, `posterize`, `hsb`,
 *     `solarize`, `grade`) applied straight-color formulas directly to
 *     premultiplied RGB — same invariant violation.
 *  4. `filters.blur.gaussian` silently clamped requested radius and
 *     overrode explicit sigma; the UI `radius.max` was larger than the
 *     shader's `kernelRadius` cap.
 *  5. `filters.blur.gaussianSeparable` and `filters.glow` recipes
 *     declared `colorSpace: "linear"` but piped through a `filters.blur.gaussian`
 *     declared `colorSpace: "srgb"`.
 *  6. `mask.fromImage` and `keyer.lumaKey` used Rec. 601 luma weights on
 *     inputs declared `colorSpace: "linear"`.
 */

import { describe, it, expect } from "vitest";
import {
  BLEND_COMPOSITE_FRAGMENT
} from "../src/compositor/shaders.js";
import {
  blurGaussianV1,
  colorBrightnessContrastV1,
  colorGradeV1,
  colorHsbV1,
  colorInvertV1,
  colorPosterizeV1,
  colorSolarizeV1,
  filtersBlurSeparableV1,
  filtersGlowV1,
  keyerLumaKeyV1,
  maskApplyV1,
  maskFromImageV1
} from "../src/shaders/index.js";

describe("compositor blend formula", () => {
  it("un-premultiplies dst before passing it to applyBlendMode", () => {
    // The W3C formula expects Cd to be the *straight* destination color. The
    // ping-pong accumulator stores premultiplied results, so the shader must
    // divide RGB by alpha before feeding it to the blend function.
    expect(BLEND_COMPOSITE_FRAGMENT).toMatch(/dst\.rgb\s*\/\s*max\(\s*da/);
  });

  it("uses dst.rgb (premultiplied) — not da * dc — in the (1-αs) term", () => {
    // The third term of the W3C formula in premul-output form is
    //   (1 - αs) · dst.rgb_premul
    // not (1 - αs) · αd · dc_straight. Both forms are mathematically equal
    // when dc is straight, but the shader operates on the already-premul
    // dst.rgb, so the simplified form is the only one that produces the
    // right answer end-to-end.
    expect(BLEND_COMPOSITE_FRAGMENT).toMatch(
      /\(\s*1\.0\s*-\s*sa\s*\)\s*\*\s*dst\.rgb/
    );
    // The buggy form (1-sa)*da*dc must not be present.
    expect(BLEND_COMPOSITE_FRAGMENT).not.toMatch(
      /\(\s*1\.0\s*-\s*sa\s*\)\s*\*\s*da\s*\*\s*dc\b/
    );
  });
});

describe("premultiplied invariant: mask.apply", () => {
  it("multiplies RGB by coverage when scaling alpha", () => {
    // Input is premultiplied (rgb = α·C). Reducing alpha by `coverage`
    // requires reducing RGB by the same factor to keep rgb ≤ α.
    expect(maskApplyV1.wgsl).toMatch(/src\.rgb\s*\*\s*coverage/);
  });
});

describe("premultiplied invariant: keyer.lumaKey", () => {
  it("multiplies RGB by coverage when scaling alpha", () => {
    expect(keyerLumaKeyV1.wgsl).toMatch(/src\.rgb\s*\*\s*coverage/);
  });

  it("uses Rec. 709 luma weights on declared-linear input", () => {
    // Input is declared `colorSpace: "linear"`. Rec. 601 weights
    // (0.299, 0.587, 0.114) are designed for gamma-encoded video.
    // Rec. 709 linear weights are (0.2126, 0.7152, 0.0722).
    expect(keyerLumaKeyV1.wgsl).toMatch(/0\.2126/);
    expect(keyerLumaKeyV1.wgsl).toMatch(/0\.7152/);
    expect(keyerLumaKeyV1.wgsl).toMatch(/0\.0722/);
    expect(keyerLumaKeyV1.wgsl).not.toMatch(/0\.299\b/);
  });

  it("computes luma on un-premultiplied (straight) RGB", () => {
    // For α<1 inputs, taking the dot product on premultiplied RGB gives
    // α·luma_true instead of luma_true — the band thresholds become
    // alpha-dependent. Audit fix: un-premultiply before the dot product.
    expect(keyerLumaKeyV1.wgsl).toMatch(/src\.rgb\s*\/\s*[a-zA-Z_]/);
  });
});

describe("premultiplied invariant: color modules", () => {
  // After the fix each module must include the un-premultiply / re-premultiply
  // pattern (a `safeA` floor and a final multiply by `src.a` on output) so
  // its output stays valid premultiplied alpha.

  const PREMUL_INVARIANT_MODULES = [
    { name: "color.invert", module: colorInvertV1 },
    { name: "color.brightnessContrast", module: colorBrightnessContrastV1 },
    { name: "color.posterize", module: colorPosterizeV1 },
    { name: "color.hsb", module: colorHsbV1 },
    { name: "color.solarize", module: colorSolarizeV1 },
    { name: "color.grade", module: colorGradeV1 }
  ];

  for (const { name, module } of PREMUL_INVARIANT_MODULES) {
    describe(name, () => {
      it("operates on straight RGB (un-premultiplies before the op)", () => {
        // Look for the un-premultiply step. Fragment shaders typically name
        // the sampled texel `src`; the compute-kind grade module names it
        // `color`. Either form is acceptable.
        const wgsl = module.wgsl;
        const hasSrcDiv = /src\.rgb\s*\/\s*[a-zA-Z_]/.test(wgsl);
        const hasColorDiv = /color\.rgb\s*\/\s*[a-zA-Z_]/.test(wgsl);
        expect(hasSrcDiv || hasColorDiv).toBe(true);
      });

      it("re-premultiplies the result before storing", () => {
        // The final stored RGB must be multiplied by alpha so rgb <= a holds.
        // Match an explicit `* src.a` / `* color.a` re-premultiply, or the
        // compact `vec3f(src.a) - …` form which yields valid premul directly.
        const wgsl = module.wgsl;
        const hasRemul = /\*\s*(src|color)\.a\b/.test(wgsl);
        const hasCompact = /vec3f\(\s*(src|color)\.a\s*\)\s*-/.test(wgsl);
        expect(hasRemul || hasCompact).toBe(true);
      });

      it("keeps alpha contract premultiplied → premultiplied", () => {
        // The fix is in-shader, not a contract change.
        expect(module.io.inputs.source.alpha).toBe("premultiplied");
        expect(module.io.output.alpha).toBe("premultiplied");
      });
    });
  }
});

describe("filters.blur.gaussian: param honesty", () => {
  it("paramUi.radius.max does not exceed the WGSL kernel-radius cap", () => {
    // The shader caps `kernelRadius` at a literal 20.0; if the UI advertises
    // a larger max, requests above the cap get silently truncated.
    const wgsl = blurGaussianV1.wgsl;
    const m = wgsl.match(/min\(\s*blur\.radius\s*,\s*([0-9]+(?:\.[0-9]+)?)/);
    expect(m).not.toBeNull();
    const cap = Number(m![1]);
    const uiMax = (
      blurGaussianV1.paramUi as { radius: { max: number } }
    ).radius.max;
    expect(uiMax).toBeLessThanOrEqual(cap);
  });

  it("honors a caller-supplied non-zero sigma instead of forcing radius/3", () => {
    // Buggy form: `max(blur.sigma, blur.radius / 3.0)` raises an explicit
    // sigma < radius/3. Correct form uses `select` (or equivalent) so the
    // radius/3 default kicks in only when sigma is ≤ 0.
    expect(blurGaussianV1.wgsl).not.toMatch(
      /max\(\s*blur\.sigma\s*,\s*blur\.radius\s*\/\s*3\.0\s*\)/
    );
    // After the fix, the shader uses a `<= 0` branch.
    expect(blurGaussianV1.wgsl).toMatch(/blur\.sigma\s*<=\s*0\.0/);
  });
});

describe("filters.blur recipes: colorSpace consistency", () => {
  it("filters.blur.gaussianSeparable contract matches the gaussian module", () => {
    expect(filtersBlurSeparableV1.io.inputs.source.colorSpace).toBe(
      blurGaussianV1.io.inputs.source.colorSpace
    );
    expect(filtersBlurSeparableV1.io.output.colorSpace).toBe(
      blurGaussianV1.io.output.colorSpace
    );
  });

  it("filters.glow contract matches the gaussian module it routes through", () => {
    expect(filtersGlowV1.io.inputs.source.colorSpace).toBe(
      blurGaussianV1.io.inputs.source.colorSpace
    );
    expect(filtersGlowV1.io.output.colorSpace).toBe(
      blurGaussianV1.io.output.colorSpace
    );
  });
});

describe("mask.fromImage: luma weights", () => {
  it("uses Rec. 709 luma weights on declared-linear input", () => {
    expect(maskFromImageV1.io.inputs.source.colorSpace).toBe("linear");
    expect(maskFromImageV1.wgsl).toMatch(/0\.2126/);
    expect(maskFromImageV1.wgsl).toMatch(/0\.7152/);
    expect(maskFromImageV1.wgsl).toMatch(/0\.0722/);
    expect(maskFromImageV1.wgsl).not.toMatch(/0\.299\b/);
  });
});
