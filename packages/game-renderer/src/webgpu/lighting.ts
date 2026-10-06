import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { parseTint } from "../frame.js";
export const LIGHT_SHADER = `
struct Camera { center: vec2f, viewport: vec2f, zoom: f32, padding0: f32, padding1: f32, padding2: f32 };
struct PointLight { position: vec2f, radius: f32, intensity: f32, color: vec4f, falloff: f32, pad0: f32, pad1: f32, pad2: f32 };
struct Lighting { ambient: vec4f, info: vec4f, points: array<PointLight, 32> };
fn srgbToLinear(rgb: vec3f) -> vec3f {
  return select(rgb / 12.92, pow((rgb + 0.055) / 1.055, vec3f(2.4)), rgb > vec3f(0.04045));
}
@group(0) @binding(0) var<uniform> camera: Camera;
@group(0) @binding(1) var<uniform> lighting: Lighting;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let world = camera.center + (input.uv - vec2f(0.5, 0.5)) * camera.viewport / camera.zoom * vec2f(1.0, -1.0);
  var irradiance = srgbToLinear(lighting.ambient.rgb) * lighting.ambient.a;
  for (var i = 0u; i < 32u; i += 1u) {
    if (i >= u32(lighting.info.x)) { break; }
    let point = lighting.points[i];
    let distance = length(world - point.position);
    if (distance < point.radius) {
      irradiance += srgbToLinear(point.color.rgb) * point.intensity * pow(1.0 - distance / point.radius, point.falloff);
    }
  }
  return vec4f(irradiance, 1.0);
}`;


export function gameLightingUniforms(frame: GameRenderFrame): Float32Array {
    const lighting = new Float32Array(392);
    const sceneLighting = frame.lighting;
    if (sceneLighting) {
      const ambient = parseTint(sceneLighting.ambient.color);
      lighting.set([ambient[0], ambient[1], ambient[2], sceneLighting.ambient.intensity,
        sceneLighting.points.length, 1], 0);
      for (const [index, point] of sceneLighting.points.entries()) {
        const color = parseTint(point.color);
        lighting.set([point.x, point.y, point.radius, point.intensity,
          color[0], color[1], color[2], 0, point.falloff], 8 + index * 12);
      }
    }
    return lighting;
}
