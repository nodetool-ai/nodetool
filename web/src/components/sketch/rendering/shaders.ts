/**
 * WGSL shaders for the WebGPU compositing pipeline.
 *
 * Two pipelines:
 * 1. **Checkerboard** – procedural checkerboard background drawn via vertex/fragment shader.
 * 2. **Layer composite** – blits a layer texture onto the framebuffer with
 *    opacity, offset, and blend mode.
 *
 * Each layer is drawn as a full-screen quad; blend modes are implemented via
 * custom fragment output combined with GPUBlendState configuration.
 */

// ─── Shared full-screen-quad vertex shader ────────────────────────────────

export const FULLSCREEN_QUAD_VERTEX = /* wgsl */ `
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  // Full-screen triangle strip: 4 vertices → 2 triangles covering NDC [-1,1]
  var pos = array<vec2f, 4>(
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
    vec2f(-1.0,  1.0),
    vec2f( 1.0,  1.0),
  );
  var uv = array<vec2f, 4>(
    vec2f(0.0, 1.0),
    vec2f(1.0, 1.0),
    vec2f(0.0, 0.0),
    vec2f(1.0, 0.0),
  );
  var out: VertexOutput;
  out.position = vec4f(pos[vertexIndex], 0.0, 1.0);
  out.uv = uv[vertexIndex];
  return out;
}
`;

// ─── Checkerboard fragment shader ─────────────────────────────────────────

export const CHECKERBOARD_FRAGMENT = /* wgsl */ `
struct CheckerboardUniforms {
  canvasSize: vec2f,
  cellSize: f32,
  _pad: f32,
  colorA: vec4f,
  colorB: vec4f,
};

@group(0) @binding(0) var<uniform> params: CheckerboardUniforms;

@fragment
fn fs_checkerboard(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * params.canvasSize;
  let checker = floor(pixel / vec2f(params.cellSize));
  let isEven = (i32(checker.x) + i32(checker.y)) % 2 == 0;
  return select(params.colorB, params.colorA, isEven);
}
`;

// ─── Layer composite fragment shader ──────────────────────────────────────

export const LAYER_COMPOSITE_FRAGMENT = /* wgsl */ `
struct LayerUniforms {
  opacity: f32,
  // Offset in UV space (offset_pixels / canvas_pixels)
  offsetU: f32,
  offsetV: f32,
  _pad: f32,
};

@group(0) @binding(0) var<uniform> layer: LayerUniforms;
@group(0) @binding(1) var layerTexture: texture_2d<f32>;

@fragment
fn fs_layer(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sampleUV = uv - vec2f(layer.offsetU, layer.offsetV);
  // Discard pixels outside the layer texture bounds
  if (sampleUV.x < 0.0 || sampleUV.x >= 1.0 || sampleUV.y < 0.0 || sampleUV.y >= 1.0) {
    return vec4f(0.0, 0.0, 0.0, 0.0);
  }
  let dims = vec2f(textureDimensions(layerTexture));
  let texel = vec2i(sampleUV * dims);
  let color = textureLoad(layerTexture, texel, 0);
  let alpha = color.a * layer.opacity;
  return vec4f(color.rgb * alpha, alpha);
}
`;

// ─── Border fragment shader ───────────────────────────────────────────────

export const BORDER_FRAGMENT = /* wgsl */ `
struct BorderUniforms {
  canvasSize: vec2f,
  lineWidth: f32,
  _pad: f32,
  color: vec4f,
};

@group(0) @binding(0) var<uniform> border: BorderUniforms;

@fragment
fn fs_border(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pixel = uv * border.canvasSize;
  let dist = min(
    min(pixel.x, border.canvasSize.x - pixel.x),
    min(pixel.y, border.canvasSize.y - pixel.y)
  );
  if (dist <= border.lineWidth) {
    return border.color;
  }
  return vec4f(0.0, 0.0, 0.0, 0.0);
}
`;
