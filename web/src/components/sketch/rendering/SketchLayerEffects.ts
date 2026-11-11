import { FULLSCREEN_QUAD_VERTEX } from "@nodetool-ai/gpu/webgpu";
import { layerColorFilters } from "@nodetool-ai/image-editor/render.js";

import type { LayerEffect } from "../types";

// CSS Filter Effects matrices operate on straight sRGB and clamp each stage.
const SHADER = /* wgsl */ `
${FULLSCREEN_QUAD_VERTEX}

@group(0) @binding(0) var source: texture_2d<f32>;
@group(0) @binding(1) var<storage, read> filters: array<vec4f>;

@fragment
fn fs_layer_effects(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let pixel = textureLoad(source, vec2i(position.xy), 0);
  var rgb = pixel.rgb;
  for (var i = 0u; i < arrayLength(&filters); i++) {
    let operation = filters[i];
    switch u32(operation.x) {
      case 0u: { rgb *= operation.y; }
      case 1u: { rgb = (rgb - 0.5) * operation.y + 0.5; }
      case 2u: {
        let gray = vec3f(dot(rgb, vec3f(0.213, 0.715, 0.072)));
        rgb = gray + operation.y * (rgb - gray);
      }
      default: {
        let gray = vec3f(dot(rgb, vec3f(0.213, 0.715, 0.072)));
        let sine = vec3f(
          dot(rgb, vec3f(-0.213, -0.715, 0.928)),
          dot(rgb, vec3f(0.143, 0.140, -0.283)),
          dot(rgb, vec3f(-0.787, 0.715, 0.072))
        );
        rgb = gray + operation.y * (rgb - gray) + operation.z * sine;
      }
    }
    rgb = clamp(rgb, vec3f(0.0), vec3f(1.0));
  }
  return vec4f(rgb, pixel.a);
}
`;

interface EffectLayer {
  effects: readonly LayerEffect[];
  params: GPUBuffer | null;
  output: GPUTexture | null;
  source: GPUTexture | null;
}

/** Cache one filtered surface per affine layer, with its own GPU resources. */
export class SketchLayerEffects {
  private readonly layers = new Map<string, EffectLayer>();
  private pipeline: GPURenderPipeline | null = null;

  constructor(private readonly device: GPUDevice) {}

  encode(
    encoder: GPUCommandEncoder,
    layerId: string,
    source: GPUTexture,
    effects: readonly LayerEffect[],
    activeStroke: boolean
  ): GPUTexture {
    if (effects.length === 0) {
      this.delete(layerId);
      return source;
    }
    let layer = this.layers.get(layerId);
    if (layer?.effects !== effects) {
      layer?.params?.destroy();
      const params = this.createParams(effects);
      if (!params) layer?.output?.destroy();
      layer = {
        effects,
        params,
        output: params ? layer?.output ?? null : null,
        source: null
      };
      this.layers.set(layerId, layer);
    }
    if (!layer.params) return source;

    if (layer.output?.width !== source.width || layer.output.height !== source.height) {
      layer.output?.destroy();
      layer.output = this.device.createTexture({
        label: `sketch-layer-effects-${layerId}`,
        size: { width: source.width, height: source.height },
        format: "rgba8unorm",
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.RENDER_ATTACHMENT
      });
      layer.source = null;
    }
    if (!activeStroke && layer.source === source) return layer.output;

    const pipeline = this.pipeline ??= this.createPipeline();
    const group = this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: { buffer: layer.params } }
      ]
    });
    const pass = encoder.beginRenderPass({
      label: "sketch-layer-effects",
      colorAttachments: [{
        view: layer.output.createView(),
        loadOp: "clear",
        storeOp: "store",
        clearValue: { r: 0, g: 0, b: 0, a: 0 }
      }]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, group);
    pass.draw(4);
    pass.end();
    // A stroke changes the merge texture in place on each pointer update.
    layer.source = activeStroke ? null : source;
    return layer.output;
  }

  invalidate(layerId: string): void {
    const layer = this.layers.get(layerId);
    if (layer) layer.source = null;
  }

  delete(layerId: string): void {
    const layer = this.layers.get(layerId);
    layer?.params?.destroy();
    layer?.output?.destroy();
    this.layers.delete(layerId);
  }

  dispose(): void {
    for (const layerId of this.layers.keys()) this.delete(layerId);
  }

  private createParams(effects: readonly LayerEffect[]): GPUBuffer | null {
    const filters = layerColorFilters(effects);
    if (filters.length === 0) return null;
    const data = new Float32Array(filters.length * 4);
    for (const [i, [kind, amount]] of filters.entries()) {
      const offset = i * 4;
      if (kind === "hue-rotate") {
        if (!Number.isFinite(amount)) return null;
        const radians = (amount % 360) * Math.PI / 180;
        data.set([3, Math.cos(radians), Math.sin(radians), 0], offset);
      } else {
        // An invalid CSS filter value invalidates the entire list.
        if (amount < 0 || !Number.isFinite(Math.fround(amount))) return null;
        const operation = kind === "brightness" ? 0 : kind === "contrast" ? 1 : 2;
        data.set([operation, amount, 0, 0], offset);
      }
    }
    const buffer = this.device.createBuffer({
      label: "sketch-layer-effect-params",
      size: data.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  private createPipeline(): GPURenderPipeline {
    const module = this.device.createShaderModule({ code: SHADER });
    return this.device.createRenderPipeline({
      label: "sketch-layer-effects",
      layout: "auto",
      vertex: { module, entryPoint: "vs_main" },
      fragment: { module, entryPoint: "fs_layer_effects", targets: [{ format: "rgba8unorm" }] },
      primitive: { topology: "triangle-strip" }
    });
  }
}
