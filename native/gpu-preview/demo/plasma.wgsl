// The demo's compute shader: an animated color field written straight into
// the texture the Qt Quick item shows. `time` comes from ShaderFrameSource.
// The catalog entry is built in DemoCatalog.cpp. The rgba16float module is
// this source with the storage format replaced.

struct Params {
  time: f32,
  frame: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var target_image: texture_storage_2d<rgba8unorm, write>;

@compute @workgroup_size(8, 8)
fn main(@builtin(global_invocation_id) id: vec3u) {
  let size = textureDimensions(target_image);
  if (id.x >= size.x || id.y >= size.y) {
    return;
  }
  let uv = vec2f(id.xy) / vec2f(size);
  let t = params.time;
  let wave = sin(uv.x * 10.0 + t) + sin(uv.y * 8.0 - t * 1.3) + sin((uv.x + uv.y) * 6.0 + t * 0.7);
  let rgb = 0.5 + 0.5 * cos(vec3f(0.0, 2.094, 4.188) + wave + t);
  // Premultiplied alpha that falls off toward the corners, so the window's
  // background shows through.
  let centered = uv - vec2f(0.5);
  let alpha = clamp(1.35 - 2.0 * dot(centered, centered) * 2.0, 0.0, 1.0);
  textureStore(target_image, vec2i(id.xy), vec4f(rgb * alpha, alpha));
}
