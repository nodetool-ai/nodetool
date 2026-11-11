/** Text fragments preserve the existing RGBA8 shader bytes and operation order. */
export const SRGB_TRANSFER_WGSL = `fn decode(v: vec3f) -> vec3f {
  return select(pow((v + 0.055) / 1.055, vec3f(2.4)), v / 12.92, v <= vec3f(0.04045));
}
fn encode(v: vec3f) -> vec3f {
  return select(1.055 * pow(v, vec3f(1.0 / 2.4)) - 0.055, 12.92 * v, v <= vec3f(0.0031308));
}
`;

export const PREMULTIPLY_RGB_WGSL = "c.rgb * c.a";
export const UNPREMULTIPLY_RGB_WGSL = "c.rgb / c.a";
export const ZERO_ALPHA_WGSL = "c.a <= 0.0";
export const EXPOSURE_UNPREMULTIPLY_WGSL = "src.rgb / max(src.a, 1.0 / 255.0)";
