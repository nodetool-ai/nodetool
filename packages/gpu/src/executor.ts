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
 * The `fragment` arm (full-screen pass) drives image-in/image-out modules;
 * the `compute` arm (a workgroup dispatch writing a storage-texture output)
 * drives the migrated timeline effects. Both share input validation, the
 * params packer, and bind-group construction — only the pipeline kind and the
 * encoded pass differ.
 */

import { writeToArrayBuffer } from "typegpu";
import * as d from "typegpu/data";
import type { TgpuBindGroupLayout } from "typegpu";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import type { GPUCapabilities, GPUContext } from "./context.js";
import {
  FULLSCREEN_TRIANGLE_VERTEX,
  FULLSCREEN_VERTEX_ENTRY
} from "./fullscreenQuad.js";
import { moduleKey, type ShaderModule, type ShaderVariant } from "./module.js";
import type { LabeledTexture } from "./texture.js";

export type ExecutorDispatch =
  | { kind: "fragment" }
  | { kind: "compute"; x: number; y: number; z?: number };

/**
 * The slice of a module the Executor actually binds against. Either the
 * module's primary (`layout`, `wgsl`, `entryPoint`, `samplers`,
 * `workgroupSize`) or one of its `variants` selected by
 * {@link resolveVariant}.
 */
export interface ResolvedShader {
  layout: TgpuBindGroupLayout;
  wgsl: string;
  entryPoint: string;
  samplers: Readonly<Record<string, GPUSamplerDescriptor>>;
  workgroupSize: readonly [number, number, number];
  /** `undefined` ⇒ module's primary; otherwise the chosen variant's name. */
  variant: string | undefined;
}

function variantMatchesInputs(
  variant: ShaderVariant,
  inputs: Record<string, LabeledTexture>
): boolean {
  const required = variant.bindingKinds;
  if (!required) {
    return true;
  }
  for (const [name, kind] of Object.entries(required)) {
    const bound = inputs[name];
    if (!bound) {
      continue;
    }
    if (bound.meta.bindingKind !== kind) {
      return false;
    }
  }
  return true;
}

function variantMeetsCapabilities(
  variant: ShaderVariant,
  capabilities: GPUCapabilities
): boolean {
  const req = variant.requires;
  if (!req) {
    return true;
  }
  if (req.textureExternal && !capabilities.textureExternal) {
    return false;
  }
  if (req.f16Storage && !capabilities.f16Storage) {
    return false;
  }
  return true;
}

/**
 * Resolve which `(layout, wgsl, ...)` to use for this dispatch.
 *
 * Phase 3 policy: try variants in declaration order; the first one whose
 * `bindingKinds` match the bound inputs AND whose `requires` are satisfied by
 * `ctx.capabilities` wins. If no variant matches, the module's primary is
 * used; if it can't match either (e.g. a `texture_external` input on a host
 * without that capability), the Executor lets the original validation /
 * pipeline-creation fail loud rather than substituting silently.
 */
export function resolveVariant(
  module: ShaderModule,
  inputs: Record<string, LabeledTexture>,
  capabilities: GPUCapabilities
): ResolvedShader {
  const primary: ResolvedShader = {
    layout: module.layout,
    wgsl: module.wgsl,
    entryPoint: module.entryPoint,
    samplers: module.samplers,
    workgroupSize: module.workgroupSize,
    variant: undefined
  };
  if (!module.variants || module.variants.length === 0) {
    return primary;
  }
  for (const variant of module.variants) {
    if (
      variantMatchesInputs(variant, inputs) &&
      variantMeetsCapabilities(variant, capabilities)
    ) {
      return {
        layout: variant.layout,
        wgsl: variant.wgsl,
        entryPoint: variant.entryPoint,
        samplers: variant.samplers ?? {},
        workgroupSize: variant.workgroupSize ?? module.workgroupSize,
        variant: variant.name
      };
    }
  }
  return primary;
}

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
    resolved: ResolvedShader,
    inputs: Record<string, LabeledTexture>,
    output: LabeledTexture,
    uniformBuffer: GPUBuffer | null
  ): GPUBindGroup {
    const entries: GPUBindGroupEntry[] = [];
    let binding = 0;
    for (const [name, entry] of Object.entries(resolved.layout.entries)) {
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
      } else if ("storageTexture" in entry) {
        // Storage textures are always the module's output — compute modules
        // write their result here (read-write storage is not used in the pool).
        entries.push({ binding: current, resource: output.createView() });
      } else if ("texture" in entry || "externalTexture" in entry) {
        const bound = inputs[name];
        if (bound) {
          entries.push({ binding: current, resource: bound.createView() });
          continue;
        }
        // Unbound: only allowed if the io contract marks this input optional;
        // the executor then supplies a 1×1 white texture so the WGSL samples
        // coverage = 1 everywhere (canonical mask-slot fallback). The
        // validateInputs pass has already enforced contract.optional for any
        // input named in `module.io.inputs`; if a layout has texture bindings
        // not declared in `io.inputs`, that's a programming error and we
        // surface it here as a missing-binding error rather than a silent
        // white-texture substitution.
        const contract = module.io.inputs[name];
        if (!contract) {
          throw new Error(
            `${moduleKey(module.id, module.version)}: layout binds texture "${name}" but it is not declared in io.inputs`
          );
        }
        if (!contract.optional) {
          throw new Error(
            `${moduleKey(module.id, module.version)}: no texture bound for required input "${name}"`
          );
        }
        entries.push({
          binding: current,
          resource: ctx.getDefaultWhiteTexture().createView()
        });
      } else if ("sampler" in entry) {
        const descriptor = resolved.samplers[name];
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
      layout: ctx.root.unwrap(resolved.layout),
      entries
    });
  }

  function getFragmentPipeline(
    ctx: GPUContext,
    module: ShaderModule,
    resolved: ResolvedShader,
    targetFormat: GPUTextureFormat
  ): GPURenderPipeline {
    const variantTag = resolved.variant ? `:${resolved.variant}` : "";
    const cacheKey = `${moduleKey(module.id, module.version)}${variantTag}:fragment:${targetFormat}`;
    const cached = ctx.pipelineCache.get(cacheKey);
    if (cached) {
      return cached as GPURenderPipeline;
    }
    const shaderModule = ctx.device.createShaderModule({
      label: `${module.id}-shader`,
      code: `${FULLSCREEN_TRIANGLE_VERTEX}\n${resolved.wgsl}`
    });
    const pipeline = ctx.device.createRenderPipeline({
      label: `${module.id}-pipeline`,
      layout: ctx.device.createPipelineLayout({
        bindGroupLayouts: [ctx.root.unwrap(resolved.layout)]
      }),
      vertex: { module: shaderModule, entryPoint: FULLSCREEN_VERTEX_ENTRY },
      fragment: {
        module: shaderModule,
        entryPoint: resolved.entryPoint,
        targets: [{ format: targetFormat }]
      },
      primitive: { topology: "triangle-list" }
    });
    ctx.pipelineCache.set(cacheKey, pipeline);
    return pipeline;
  }

  function getComputePipeline(
    ctx: GPUContext,
    module: ShaderModule,
    resolved: ResolvedShader
  ): GPUComputePipeline {
    const variantTag = resolved.variant ? `:${resolved.variant}` : "";
    const cacheKey = `${moduleKey(module.id, module.version)}${variantTag}:compute`;
    const cached = ctx.pipelineCache.get(cacheKey);
    if (cached) {
      return cached as GPUComputePipeline;
    }
    const shaderModule = ctx.device.createShaderModule({
      label: `${module.id}-shader`,
      code: resolved.wgsl
    });
    const pipeline = ctx.device.createComputePipeline({
      label: `${module.id}-pipeline`,
      layout: ctx.device.createPipelineLayout({
        bindGroupLayouts: [ctx.root.unwrap(resolved.layout)]
      }),
      compute: { module: shaderModule, entryPoint: resolved.entryPoint }
    });
    ctx.pipelineCache.set(cacheKey, pipeline);
    return pipeline;
  }

  function packUniform<Schema extends AnyWgslStruct>(
    ctx: GPUContext,
    module: ShaderModule<Schema>,
    resolved: ResolvedShader,
    params: Infer<Schema>
  ): GPUBuffer | null {
    const hasUniform = Object.values(resolved.layout.entries).some(
      (entry) => entry !== null && "uniform" in entry
    );
    if (!hasUniform) {
      return null;
    }
    // The module's TypeGPU schema is the single source of truth for the byte
    // layout — `writeToArrayBuffer` packs `params` exactly as the WGSL struct
    // expects. The packed bytes go into a buffer from the context's reused
    // ring (see `UniformRing`) rather than a fresh per-encode allocation.
    const size = d.sizeOf(module.params);
    const data = new ArrayBuffer(size);
    writeToArrayBuffer(data, module.params, params);
    const buffer = ctx.uniformRing.acquire(size);
    ctx.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  function encodeFragment<Schema extends AnyWgslStruct>(
    args: EncodeArgs<Schema>,
    resolved: ResolvedShader
  ): void {
    const { ctx, module, encoder, inputs, output, params } = args;
    const uniformBuffer = packUniform(ctx, module, resolved, params);
    const bindGroup = buildBindGroup(
      ctx,
      module,
      resolved,
      inputs,
      output,
      uniformBuffer
    );
    const pipeline = getFragmentPipeline(ctx, module, resolved, output.format);

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

  function encodeCompute<Schema extends AnyWgslStruct>(
    args: EncodeArgs<Schema>,
    resolved: ResolvedShader,
    dispatch: { x: number; y: number; z?: number }
  ): void {
    const { ctx, module, encoder, inputs, output, params } = args;
    const uniformBuffer = packUniform(ctx, module, resolved, params);
    const bindGroup = buildBindGroup(
      ctx,
      module,
      resolved,
      inputs,
      output,
      uniformBuffer
    );
    const pipeline = getComputePipeline(ctx, module, resolved);

    const pass = encoder.beginComputePass({ label: `${module.id}-pass` });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(dispatch.x, dispatch.y, dispatch.z ?? 1);
    pass.end();
    output.markWritten();
  }

  return {
    encode<Schema extends AnyWgslStruct>(args: EncodeArgs<Schema>): void {
      validateInputs(args.module, args.inputs);
      const resolved = resolveVariant(
        args.module,
        args.inputs,
        args.ctx.capabilities
      );
      if (args.dispatch.kind === "fragment") {
        encodeFragment(args, resolved);
        return;
      }
      encodeCompute(args, resolved, args.dispatch);
    }
  };
}
