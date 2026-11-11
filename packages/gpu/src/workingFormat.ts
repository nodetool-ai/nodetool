import tgpu from "typegpu";
import type { AnyWgslStruct } from "typegpu/data";
import type { ShaderModule, ShaderVariant } from "./module.js";
import type { IOContract } from "./types.js";
import type { PrecisionSlots, WorkingFormat } from "./workingFrame.js";

export function validatePrecisionSlots(module: { id: string; io: IOContract; precision?: PrecisionSlots }): void {
  const slots = [...Object.keys(module.io.inputs), "output"].sort();
  if (!module.precision || JSON.stringify(Object.keys(module.precision).sort()) !== JSON.stringify(slots)) {
    throw new Error(`${module.id}: unclassified precision slots`);
  }
}

const cache = new WeakMap<ShaderModule, ShaderModule>();
/** Byte mode preserves object, layout, shader source and pipeline identity. */
export function resolveWorkingModule<S extends AnyWgslStruct>(module: ShaderModule<S>, format: WorkingFormat): ShaderModule<S> {
  if (format === "rgba8unorm") {
    return module;
  }
  validatePrecisionSlots(module);
  if (module.precision?.output === "fixed") {
    return module;
  }
  const previous = cache.get(module);
  if (previous) {
    // SAFETY: this cache is keyed by the module, and a specialization keeps its uniform schema S.
    return previous as ShaderModule<S>;
  }
  const specialize = (shader: Pick<ShaderModule, "layout" | "wgsl" | "workingWgsl">) => {
    const layout = tgpu.bindGroupLayout(Object.fromEntries(Object.entries(shader.layout.entries).map(([name, entry]) => {
      if (!entry || !("storageTexture" in entry)) {
        return [name, entry];
      }
      if (entry.storageTexture.format !== "rgba8unorm" || entry.storageTexture.dimension !== "2d" || entry.storageTexture.access !== "write-only") {
        throw new Error(`${module.id}: unsupported storage binding ${name}`);
      }
      return [name, { ...entry, storageTexture: format }];
    })));
    return {
      layout,
      wgsl: (shader.workingWgsl ?? shader.wgsl).replaceAll("texture_storage_2d<rgba8unorm", "texture_storage_2d<rgba16float")
    };
  };
  const resolved = {
    ...module, ...specialize(module),
    io: { ...module.io, output: { ...module.io.output, format } },
    variants: module.variants?.map((variant): ShaderVariant => ({ ...variant, ...specialize(variant) }))
  };
  cache.set(module, resolved);
  return resolved;
}

/** Never silently quantize a declared working output in an FP16 chain. */
export function validateWorkingOutput(module: { id: string; io: IOContract; precision?: PrecisionSlots }, format: WorkingFormat, actual: GPUTextureFormat): void {
  if (format === "rgba8unorm") {
    return;
  }
  validatePrecisionSlots(module);
  const expected = module.precision?.output !== "fixed" ? format : module.io.output.format;
  if (actual !== expected) {
    throw new Error(`${module.id}: fixed-byte working slot or incompatible fixed output: expected ${expected}, got ${actual}`);
  }
}
