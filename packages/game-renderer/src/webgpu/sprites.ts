import type { Batch, TextureEntry, Blend } from "./types.js";
export const INSTANCE_FLOATS = 14;
export const SHADER = `
struct Camera { center: vec2f, viewport: vec2f, zoom: f32, padding0: f32, padding1: f32, padding2: f32 };
override linearizeInput: bool = false;
fn srgbToLinear(rgb: vec3f) -> vec3f {
  return select(rgb / 12.92, pow((rgb + 0.055) / 1.055, vec3f(2.4)), rgb > vec3f(0.04045));
}
fn linearToSrgb(rgb: vec3f) -> vec3f {
  return select(rgb * 12.92, 1.055 * pow(rgb, vec3f(1.0 / 2.4)) - 0.055, rgb > vec3f(0.0031308));
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var atlasSampler: sampler;
@group(0) @binding(2) var atlas: texture_2d<f32>;
@group(1) @binding(0) var lightSampler: sampler;
@group(1) @binding(1) var lightTexture: texture_2d<f32>;

struct VertexInput {
  @builtin(vertex_index) corner: u32,
  @location(0) center: vec2f,
  @location(1) size: vec2f,
  @location(2) uv: vec4f,
  @location(3) color: vec4f,
  @location(4) rotation: f32,
  @location(5) unlit: f32,
};
struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
  @location(1) color: vec4f,
  @location(3) @interpolate(flat) unlit: f32,
  @location(4) lightUv: vec2f,
};
@vertex fn vertexMain(input: VertexInput) -> VertexOutput {
  let corners = array<vec2f, 6>(
    vec2f(-0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, 0.5),
    vec2f(0.5, 0.5), vec2f(-0.5, -0.5), vec2f(0.5, -0.5));
  let local = corners[input.corner] * input.size;
  let sine = sin(input.rotation);
  let cosine = cos(input.rotation);
  let rotated = vec2f(local.x * cosine - local.y * sine, local.x * sine + local.y * cosine);
  let world = input.center + rotated;
  let clip = (world - camera.center) * camera.zoom * 2.0 / camera.viewport;
  var output: VertexOutput;
  output.position = vec4f(clip, 0.0, 1.0);
  let uvCorner = corners[input.corner] + vec2f(0.5, 0.5);
  output.uv = input.uv.xy + vec2f(uvCorner.x, 1.0 - uvCorner.y) * input.uv.zw;
  output.color = input.color;
  output.unlit = input.unlit;
  output.lightUv = clip * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let sampled = textureSample(atlas, atlasSampler, input.uv) * input.color;
  var straight = select(sampled.rgb, srgbToLinear(sampled.rgb), linearizeInput);
  if (input.unlit < 0.5) {
    let irradiance = textureSampleLevel(lightTexture, lightSampler, input.lightUv, 0.0).rgb;
    let lit = clamp(srgbToLinear(sampled.rgb) * irradiance, vec3f(0.0), vec3f(1.0));
    straight = select(linearToSrgb(lit), lit, linearizeInput);
  }
  return vec4f(straight * sampled.a, sampled.a);
}`;

export function appendBatch(batches: Batch[], texture: TextureEntry, blend: Blend, index: number): void {
    const last = batches[batches.length - 1];
    if (last?.texture === texture && last.blend === blend) {
      last.count++;
    } else {
      batches.push({ texture, blend, first: index, count: 1 });
    }
  }

export function writeInstance(target: Float32Array, index: number, ...values: number[]): void {
    target.set(values, index * INSTANCE_FLOATS);
  }
