/**
 * Single composite shader: full-screen quad, per-layer scale (object-fit:
 * contain), per-layer opacity. Blend mode is selected at the pipeline level
 * via fixed-function blend state — no shader-side compositing.
 */
export const compositeShader = /* wgsl */ `
struct Uniforms {
  scaleX: f32,
  scaleY: f32,
  opacity: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> u: Uniforms;
@group(1) @binding(0) var samp: sampler;
@group(1) @binding(1) var tex: texture_2d<f32>;

struct VsOut {
  @builtin(position) pos: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

@vertex
fn vs(@builtin(vertex_index) i: u32) -> VsOut {
  var positions = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0),
    vec2<f32>( 1.0, -1.0),
    vec2<f32>( 1.0,  1.0),
  );
  var uvs = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 1.0),
    vec2<f32>(1.0, 0.0),
  );
  let p = positions[i];
  var out: VsOut;
  out.pos = vec4<f32>(p.x * u.scaleX, p.y * u.scaleY, 0.0, 1.0);
  out.uv = uvs[i];
  return out;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4<f32> {
  let c = textureSample(tex, samp, in.uv);
  return vec4<f32>(c.rgb, c.a * u.opacity);
}
`;
