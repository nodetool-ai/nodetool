/**
 * Premul-typed color helpers — WGSL snippet bundle for shader authors.
 *
 * **When to use.** Any module whose input is `alpha: "premultiplied"` AND
 * whose RGB math is *nonlinear* (gamma, contrast, HSV, saturate, etc.) MUST
 * un-premultiply before touching channels and re-premultiply before writing.
 * Doing that math directly on `texture.rgb` silently produces wrong output
 * on partially transparent pixels, and the bug is invisible in the common
 * fully-opaque case. This bundle makes the mistake impossible to express:
 *
 *   - `Premul { v: vec4f }` and `Straight { v: vec4f }` are distinct structs.
 *     WGSL has no newtype, but distinct structs are nominally typed — you
 *     can't pass a `Premul` where a `Straight` is expected, and neither has
 *     a `.rgb` field, so `samp.rgb` simply won't compile.
 *   - The only way to extract channels is `unpremul(p).v.rgb` (for nonlinear
 *     ops) or `p.v` (for linear ops that stay in premul space).
 *
 * **How to use.** Interpolate the bundle into the WGSL template:
 *
 *   import { WGSL_PREMUL_HELPERS } from "../../../../shared/premulWgsl.js";
 *
 *   wgsl: \/\* wgsl \*\/ \`
 *   ${WGSL_PREMUL_HELPERS}
 *
 *   @fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
 *     let p = samplePremul(layout.$.source, layout.$.samp, uv);
 *     let s = unpremul(p);
 *     let newRgb = vec3f(1.0) - s.v.rgb;            // nonlinear op
 *     let out = premul(Straight(vec4f(newRgb, s.v.a)));
 *     return out.v;
 *   }
 *   \`
 *
 * For linear-in-rgb modules (tint multiply, brightness add, lerp between
 * two premul values, Porter-Duff over), prefer the `premul*` helpers
 * (`premulScale`, `premulAdd`, `premulOver`) so the *intent* is local —
 * a reader doesn't have to verify the math is linearity-safe by eye.
 *
 * **Migration status.** Two modules use this bundle today as proof of
 * concept: `_canary.passthrough@1` (linear) and `color.invert@1` (nonlinear,
 * previously hand-rolled the unpremul dance). Migrating the remaining 47
 * shader modules is tracked separately and is deliberate follow-up work —
 * the bundle is ship-ready; the rest of the pool isn't blocked on it.
 */
export const WGSL_PREMUL_HELPERS = /* wgsl */ `
// ---- Typed-color helpers (premul-invariant) -------------------------------
// Distinct structs; WGSL nominal typing prevents Premul/Straight from being
// swapped, and neither has a .rgb field so channel access is forced through
// unpremul()/premul().
struct Premul { v: vec4f }
struct Straight { v: vec4f }

fn samplePremul(t: texture_2d<f32>, s: sampler, uv: vec2f) -> Premul {
  return Premul(textureSample(t, s, uv));
}

fn sampleStraight(t: texture_2d<f32>, s: sampler, uv: vec2f) -> Straight {
  return Straight(textureSample(t, s, uv));
}

// 1/255 floor avoids dividing by zero on transparent pixels; the resulting
// "straight" color of a fully-transparent pixel is undefined anyway because
// rgb*0 = 0 erases all information, but the floor keeps math finite and
// matches the convention used elsewhere in the pool.
fn unpremul(p: Premul) -> Straight {
  let a = max(p.v.a, 1.0 / 255.0);
  return Straight(vec4f(p.v.rgb / a, p.v.a));
}

fn premul(s: Straight) -> Premul {
  return Premul(vec4f(s.v.rgb * s.v.a, s.v.a));
}

// Linear-op helpers — safe to apply directly to premul values without an
// unpremul round-trip. Use these when you want the intent ("this is a
// premul-safe linear op") to be visible at the call site.
fn premulScale(p: Premul, k: f32) -> Premul {
  return Premul(p.v * k);
}

fn premulAdd(a: Premul, b: Premul) -> Premul {
  return Premul(a.v + b.v);
}

// Premultiplied Porter-Duff "over": src over dst, correct on premul inputs.
fn premulOver(src: Premul, dst: Premul) -> Premul {
  return Premul(src.v + dst.v * (1.0 - src.v.a));
}
`;
