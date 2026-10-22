/**
 * RGB <-> HSV conversion for WGSL templates: interpolate `WGSL_HSV` and call
 * `rgb2hsv` / `hsv2rgb`. Hue is in 0..1, saturation and value in 0..1 for
 * in-gamut input. Pass straight (un-premultiplied) RGB, since V is `max(r,g,b)`.
 */
export const WGSL_HSV = /* wgsl */ `
fn rgb2hsv(rgb: vec3f) -> vec3f {
  let maxC = max(max(rgb.r, rgb.g), rgb.b);
  let minC = min(min(rgb.r, rgb.g), rgb.b);
  let delta = maxC - minC;
  var h: f32 = 0.0;
  var s: f32 = 0.0;
  let v: f32 = maxC;
  if (delta > 0.00001) {
    s = delta / maxC;
    if (maxC == rgb.r) {
      h = (rgb.g - rgb.b) / delta;
      if (rgb.g < rgb.b) { h = h + 6.0; }
    } else if (maxC == rgb.g) {
      h = 2.0 + (rgb.b - rgb.r) / delta;
    } else {
      h = 4.0 + (rgb.r - rgb.g) / delta;
    }
    h = h / 6.0;
  }
  return vec3f(h, s, v);
}

fn hsv2rgb(hsv: vec3f) -> vec3f {
  let h = hsv.x * 6.0;
  let s = hsv.y;
  let v = hsv.z;
  let i = floor(h);
  let f = h - i;
  let p = v * (1.0 - s);
  let q = v * (1.0 - s * f);
  let t = v * (1.0 - s * (1.0 - f));
  let idx = i32(i) % 6;
  if (idx == 0) { return vec3f(v, t, p); }
  if (idx == 1) { return vec3f(q, v, p); }
  if (idx == 2) { return vec3f(p, v, t); }
  if (idx == 3) { return vec3f(p, q, v); }
  if (idx == 4) { return vec3f(t, p, v); }
  return vec3f(v, p, q);
}
`;
