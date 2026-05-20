/**
 * `Executor` — the tiny shared runtime that turns a {@link ShaderModule} plus
 * bound textures and params into encoded GPU work.
 *
 * Steps per call: validate input labels against the module's I/O contract,
 * get-or-compile the pipeline via `ctx.pipelineCache`, pack `params` through
 * the module's TypeGPU schema, build the bind group from the module's typed
 * layout (`root.unwrap(layout)`), and encode the pass. The host owns *when*
 * to submit and *where* the output texture lives.
 *
 * **No executor-inserted readback.** `encode` records GPU commands only — it
 * never calls `copyTextureToBuffer`, `mapAsync`, or any path that pulls
 * pixels to the CPU. Materialization is a deliberate host-side step at
 * boundaries (Phase 4).
 *
 * Phase 1 implements the `fragment` arm (full-screen pass), which the canary
 * exercises. The `dispatch` discriminator is a union from day one so Phase 2's
 * `compute` arm drops in without an interface change.
 */

import { writeToArrayBuffer } from "typegpu";
import * as d from "typegpu/data";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import type { GPUContext } from "./context.js";
import {
  FULLSCREEN_TRIANGLE_VERTEX,
  FULLSCREEN_VERTEX_ENTRY
} from "./fullscreenQuad.js";
import { moduleKey, type ShaderModule } from "./module.js";
import type { LabeledTexture } from "./texture.js";

export type ExecutorDispatch =
  | { kind: "fragment" }
  | { kind: "compute"; x: number; y: number; z?: number };

export interface EncodeArgs<Schema extends AnyWgslStruct> {
  ctx: GPUContext;
  module: ShaderModule<Schema>;
  encoder: GPUCommandEncoder;
  inputs: Record<string, LabeledTexture>;
  output: LabeledTexture;
  params: Infer<Schema>;
  dispatch: ExecutorDispatch;
}

export interface Executor {
  encode<Schema extends AnyWgslStruct>(args: EncodeArgs<Schema>): void;
}

export function createExecutor(): Executor {
  const samplerCache = new WeakMap<GPUDevice, Map<string, GPUSampler>>();

  function getSampler(
    device: GPUDevice,
    descriptor: GPUSamplerDescriptor
  ): GPUSampler {
    let perDevice = samplerCache.get(device);
    if (!perDevice) {
      perDevice = new Map();
      samplerCache.set(device, perDevice);
    }
    const key = JSON.stringify(descriptor);
    let sampler = perDevice.get(key);
    if (!sampler) {
      sampler = device.createSampler(descriptor);
      perDevice.set(key, sampler);
    }
    return sampler;
  }

  function validateInputs(
    module: ShaderModule,
    inputs: Record<string, LabeledTexture>
  ): void {
    for (const [name, contract] of Object.entries(module.io.inputs)) {
      const bound = inputs[name];
      if (!bound) {
        if (contract.optional) {
          continue;
        }
        throw new Error(
          `${moduleKey(module.id, module.version)}: missing required input "${name}"`
        );
      }
      if (!contract.bindingKinds.includes(bound.meta.bindingKind)) {
        throw new Error(
          `${moduleKey(module.id, module.version)}: input "${name}" has binding kind ` +
            `"${bound.meta.bindingKind}", expected one of [${contract.bindingKinds.join(", ")}]`
        );
      }
    }
  }

  function buildBindGroup(
    ctx: GPUContext,
    module: ShaderModule,
    inputs: Record<string, LabeledTexture>,
    uniformBuffer: GPUBuffer | null
  ): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [];
    let binding = 0;
    for (const [name, entry] of Object.entries(module.layout.entries)) {
      const current = binding++;
      if (!entry) {
        continue;
      }
      if ("uniform" in entry) {
        if (!uniformBuffer) {
          throw new Error(
            `${moduleKey(module.id, module.version)}: layout declares uniform "${name}" but module has no params`
          );
        }
        entries.push({ binding: current, resource: { buffer: uniformBuffer } });
      } else if ("texture" in entry || "externalTexture" in entry) {
        const bound = inputs[name];
        if (!bound) {
          throw new Error(
            `${moduleKey(module.id, module.version)}: no texture bound for "${name}"`
          );
        }
        entries.push({ binding: current, resource: bound.createView() });
      } else if ("sampler" in entry) {
        const descriptor = module.samplers[name];
        if (!descriptor) {
          throw new Error(
            `${moduleKey(module.id, module.version)}: no sampler descriptor for "${name}"`
          );
        }
        entries.push({
          binding: current,
          resource: getSampler(ctx.device, descriptor)
        });
      } else {
        throw new Error(
          `${moduleKey(module.id, module.version)}: unsupported layout entry "${name}"`
        );
      }
    }
    return ctx.device.createBindGroup({
      label: `${module.id}-bindgroup`,
      layout: ctx.root.unwrap(module.layout),
      entries
    });
  }

  function getFragmentPipeline(
    ctx: GPUContext,
    module: ShaderModule,
    targetFormat: GPUTextureFormat
  ): GPURenderPipeline {
    const cacheKey = `${moduleKey(module.id, module.version)}:fragment:${targetFormat}`;
    const cached = ctx.pipelineCache.get(cacheKey);
    if (cached) {
      return cached as GPURenderPipeline;
    }
    const shaderModule = ctx.device.createShaderModule({
      label: `${module.id}-shader`,
      code: `${FULLSCREEN_TRIANGLE_VERTEX}\n${module.wgsl}`
    });
    const pipeline = ctx.device.createRenderPipeline({
      label: `${module.id}-pipeline`,
      layout: ctx.device.createPipelineLayout({
        bindGroupLayouts: [ctx.root.unwrap(module.layout)]
      }),
      vertex: { module: shaderModule, entryPoint: FULLSCREEN_VERTEX_ENTRY },
      fragment: {
        module: shaderModule,
        entryPoint: module.entryPoint,
        targets: [{ format: targetFormat }]
      },
      primitive: { topology: "triangle-list" }
    });
    ctx.pipelineCache.set(cacheKey, pipeline);
    return pipeline;
  }

  function packUniform<Schema extends AnyWgslStruct>(
    ctx: GPUContext,
    module: ShaderModule<Schema>,
    params: Infer<Schema>
  ): GPUBuffer | null {
    const hasUniform = Object.values(module.layout.entries).some(
      (entry) => entry !== null && "uniform" in entry
    );
    if (!hasUniform) {
      return null;
    }
    // The module's TypeGPU schema is the single source of truth for the byte
    // layout — `writeToArrayBuffer` packs `params` exactly as the WGSL struct
    // expects. (Phase 2's Executor adds a reused per-frame buffer ring; Phase
    // 1 allocates per encode, which is enough for the canary.)
    const size = d.sizeOf(module.params);
    const data = new ArrayBuffer(size);
    writeToArrayBuffer(data, module.params, params);
    const buffer = ctx.device.createBuffer({
      label: `${module.id}-uniform`,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    ctx.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function encodeFragment<Schema extends AnyWgslStruct>(
    args: EncodeArgs<Schema>
  ): void {
    const { ctx, module, encoder, inputs, output, params } = args;
    const uniformBuffer = packUniform(ctx, module, params);
    const bindGroup = buildBindGroup(ctx, module, inputs, uniformBuffer);
    const pipeline = getFragmentPipeline(ctx, module, output.format);

    const pass = encoder.beginRenderPass({
      label: `${module.id}-pass`,
      colorAttachments: [
        { view: output.createView(), loadOp: "clear", storeOp: "store" }
      ]
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3);
    pass.end();
    output.markWritten();
  }

  return {
    encode<Schema extends AnyWgslStruct>(args: EncodeArgs<Schema>): void {
      validateInputs(args.module, args.inputs);
      if (args.dispatch.kind === "fragment") {
        encodeFragment(args);
        return;
      }
      throw new Error(
        `Executor: dispatch kind "${args.dispatch.kind}" not implemented until Phase 2`
      );
    }
  };
}
