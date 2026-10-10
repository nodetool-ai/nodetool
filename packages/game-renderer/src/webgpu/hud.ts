import type { GameRenderFrame } from "@nodetool-ai/protocol";
import { paintGameHud2D } from "../ui/hud2d.js";
export const HUD_SHADER = `
@group(0) @binding(0) var sourceSampler: sampler;
@group(0) @binding(1) var sourceTexture: texture_2d<f32>;
struct VertexOutput { @builtin(position) position: vec4f, @location(0) uv: vec2f };
@vertex fn vertexMain(@builtin(vertex_index) index: u32) -> VertexOutput {
  let positions = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  var output: VertexOutput;
  output.position = vec4f(positions[index], 0.0, 1.0);
  output.uv = positions[index] * vec2f(0.5, -0.5) + vec2f(0.5, 0.5);
  return output;
}
@fragment fn fragmentMain(input: VertexOutput) -> @location(0) vec4f {
  let color = textureSample(sourceTexture, sourceSampler, input.uv);
  return vec4f(color.rgb * color.a, color.a);
}`;


export function paintWebGPUHud(canvas: HTMLCanvasElement, width: number, height: number, frame: GameRenderFrame,
  images?: ReadonlyMap<string, unknown>): void {
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("HUD canvas is unavailable");
      }
      context.clearRect(0, 0, canvas.width, canvas.height);
      paintGameHud2D(context, frame, 1, images);
}
