/**
 * Shared WGSL blend-mode functions.
 *
 * Both the sketch editor and the timeline preview compositor inject this
 * string into their fragment shaders (via template interpolation) so the
 * blend math is defined once. It exposes:
 *
 *   fn applyBlendMode(src: vec3f, dst: vec3f, mode: u32) -> vec3f
 *
 * `mode` is the `gpuId` from the canonical blend-mode table in
 * `blendModes.ts` — keep the switch cases in lock-step with that table.
 * The per-channel functions implement the W3C compositing spec; `add` (12)
 * is additive (saturating sum).
 */
export const WGSL_BLEND_FUNCTIONS = /* wgsl */ `
// Blend mode ids (must match BLEND_MODE_INFOS[*].gpuId in blendModes.ts):
// 0 = normal, 1 = multiply, 2 = screen, 3 = overlay, 4 = darken,
// 5 = lighten, 6 = color-dodge, 7 = color-burn, 8 = hard-light,
// 9 = soft-light, 10 = difference, 11 = exclusion, 12 = add

fn softLightD(x: f32) -> f32 {
  if (x <= 0.25) {
    return ((16.0 * x - 12.0) * x + 4.0) * x;
  }
  return sqrt(x);
}

fn blendChannel(s: f32, d: f32, mode: u32) -> f32 {
  switch (mode) {
    case 0u: { return s; }
    case 1u: { return s * d; }
    case 2u: { return s + d - s * d; }
    case 3u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        d <= 0.5
      );
    }
    case 4u: { return min(s, d); }
    case 5u: { return max(s, d); }
    case 6u: {
      return select(
        min(1.0, d / max(1.0 - s, 0.001)),
        1.0,
        s >= 1.0
      );
    }
    case 7u: {
      return select(
        max(0.0, 1.0 - (1.0 - d) / max(s, 0.001)),
        0.0,
        s <= 0.0
      );
    }
    case 8u: {
      return select(
        1.0 - 2.0 * (1.0 - s) * (1.0 - d),
        2.0 * s * d,
        s <= 0.5
      );
    }
    case 9u: {
      return select(
        d + (2.0 * s - 1.0) * (softLightD(d) - d),
        d - (1.0 - 2.0 * s) * d * (1.0 - d),
        s <= 0.5
      );
    }
    case 10u: { return abs(s - d); }
    case 11u: { return s + d - 2.0 * s * d; }
    case 12u: { return min(1.0, s + d); }
    default: { return s; }
  }
}

fn applyBlendMode(src: vec3f, dst: vec3f, mode: u32) -> vec3f {
  return vec3f(
    blendChannel(src.x, dst.x, mode),
    blendChannel(src.y, dst.y, mode),
    blendChannel(src.z, dst.z, mode)
  );
}
`;
