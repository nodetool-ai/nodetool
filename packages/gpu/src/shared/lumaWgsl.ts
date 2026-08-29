/**
 * Rec. 709 luminance — interpolate into a WGSL template, then call `luma709`.
 *
 * The weights are the linear-space set. Rec. 601 (`0.299, 0.587, 0.114`) is
 * for gamma-encoded video and is wrong for the color spaces the pool declares;
 * `shaderCorrectness.test.ts` asserts it never appears.
 *
 * What to pass is the caller's call. A nonlinear module un-premultiplies first
 * (see `shared/premulWgsl.ts`) so the result doesn't drift with alpha; a
 * `linear-in-rgb` one can hand over premultiplied RGB, because `dot` commutes
 * with the alpha multiply.
 */
export const WGSL_LUMA709 = /* wgsl */ `
fn luma709(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`;
