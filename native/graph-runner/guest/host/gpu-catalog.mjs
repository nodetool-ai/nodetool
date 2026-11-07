// Exports the WebGPU shader catalog of @nodetool-ai/gpu as data, for the
// host gpu capability (src/host/gpu.cpp). Runs in Node at bundle build time
// against the real registry, so the WGSL is the string TypeScript compiles.
//
//   node guest/host/gpu-catalog.mjs [outfile]     # writes the JSON
//
// guest/host/plugins.mjs embeds the same document in the guest bundle, which
// hands it to the host on first use.
//
// For every shader module the catalog holds what the TypeScript Executor
// derives from the module at dispatch time: the variant it picks for
// texture_2d inputs on a device without shader-f16 (createGPUContextFromDevice
// on Dawn), the resolved WGSL, the bind group layout descriptor typegpu gives
// the device, the binding order the Executor walks, the sampler descriptors,
// the uniform struct layout, and the params packed by typegpu
// (`packedDefaults`, so the host packer can be checked against it). Recipes
// keep their intermediates and pass graph.
import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SHADER_STAGE = { VERTEX: 1, FRAGMENT: 2, COMPUTE: 4 };
const BUFFER_USAGE = {
  MAP_READ: 1, MAP_WRITE: 2, COPY_SRC: 4, COPY_DST: 8, INDEX: 16, VERTEX: 32,
  UNIFORM: 64, STORAGE: 128, INDIRECT: 256, QUERY_RESOLVE: 512
};
const TEXTURE_USAGE = { COPY_SRC: 1, COPY_DST: 2, TEXTURE_BINDING: 4, STORAGE_BINDING: 8, RENDER_ATTACHMENT: 16 };

/** What createGPUContextFromDevice reports for a device requested without features. */
const CAPABILITIES = { textureExternal: true, f16Storage: false };

/** WGSL size and alignment of the uniform field types the catalog uses. */
const FIELD_LAYOUT = {
  f32: { size: 4, align: 4 },
  i32: { size: 4, align: 4 },
  u32: { size: 4, align: 4 },
  vec2f: { size: 8, align: 8 },
  vec3f: { size: 12, align: 16 },
  vec4f: { size: 16, align: 16 }
};

const roundUp = (n, align) => Math.ceil(n / align) * align;

function uniformLayout(name, schema, d) {
  let offset = 0;
  let align = 1;
  const fields = [];
  for (const [field, type] of Object.entries(schema.propTypes)) {
    const element = type.type === "array" ? type.elementType : type;
    const atom = FIELD_LAYOUT[element.type];
    const layout = type.type === "array" && atom ? { size: roundUp(atom.size, atom.align) * type.elementCount, align: atom.align } : atom;
    if (!layout) throw new Error(`${name}: uniform field ${field} has unsupported type ${type.type}`);
    offset = roundUp(offset, layout.align);
    if (type.type === "array") {
      for (let i = 0; i < type.elementCount; i++) fields.push({ name: field, type: element.type, offset: offset + i * roundUp(atom.size, atom.align), index: i });
    } else fields.push({ name: field, type: type.type, offset });
    offset += layout.size;
    align = Math.max(align, layout.align);
  }
  const size = roundUp(offset, align);
  if (size !== d.sizeOf(schema)) throw new Error(`${name}: uniform size ${size} differs from typegpu's ${d.sizeOf(schema)}`);
  return { size, fields };
}

const hex = (buffer) => Buffer.from(buffer).toString("hex");

/** Builds the catalog document. Installs the WebGPU flag globals typegpu reads, if missing. */
export async function buildGpuCatalog() {
  for (const [name, value] of Object.entries({
    GPUShaderStage: SHADER_STAGE,
    GPUBufferUsage: BUFFER_USAGE,
    GPUTextureUsage: TEXTURE_USAGE
  })) {
    globalThis[name] ??= value;
  }
  const pool = await import("@nodetool-ai/gpu/pool");
  const { default: tgpu, writeToArrayBuffer } = await import("typegpu");
  const d = await import("typegpu/data");

  // typegpu turns a layout into a GPUBindGroupLayoutDescriptor when it is
  // unwrapped against a device. This device records the descriptor.
  const device = new Proxy(
    { features: new Set(), limits: {}, queue: {}, lost: new Promise(() => {}), createBindGroupLayout: (desc) => ({ desc }) },
    { get: (target, key) => (key in target ? target[key] : () => ({})) }
  );
  const root = tgpu.initFromDevice({ device });

  // The registry's modules, and any module the pool exports outside it, since
  // node code imports modules directly.
  const exported = Object.values(pool).filter(
    (v) => v && typeof v === "object" && typeof v.id === "string" && Number.isInteger(v.version) && v.io
  );
  const modules = {};
  for (const module of new Set([...pool.ALL_CATALOG, ...exported])) {
    const key = pool.moduleKey(module.id, module.version);
    const io = {
      inputs: Object.fromEntries(
        Object.entries(module.io.inputs).map(([name, c]) => [name, { alpha: c.alpha, optional: !!c.optional }])
      ),
      output: { dimensions: module.io.output.dimensions, alpha: module.io.output.alpha }
    };
    if (module.kind === "recipe") {
      if (module.recipe.resolve) throw new Error(`${key}: recipes with their own resolver are not exported`);
      modules[key] = {
        kind: "recipe",
        io,
        paramDefaults: module.paramDefaults,
        intermediates: module.recipe.intermediates,
        passes: module.recipe.passes
      };
      continue;
    }
    const bound = Object.fromEntries(Object.keys(module.io.inputs).map((name) => [name, { meta: { bindingKind: "texture_2d" } }]));
    const shader = pool.resolveVariant(module, bound, CAPABILITIES);
    const descriptor = root.unwrap(shader.layout).desc;
    const kinds = ["uniform", "texture", "storageTexture", "sampler", "externalTexture"];
    const bindings = [];
    Object.entries(shader.layout.entries).forEach(([name, entry], binding) => {
      if (!entry) return;
      const kind = kinds.find((k) => k in entry);
      if (!kind) throw new Error(`${key}: layout entry ${name} has no known kind`);
      bindings.push({ name, binding, kind });
    });
    const hasUniform = bindings.some((b) => b.kind === "uniform");
    let packedDefaults = null;
    if (hasUniform) {
      const data = new ArrayBuffer(d.sizeOf(module.params));
      writeToArrayBuffer(data, module.params, module.paramDefaults);
      packedDefaults = hex(data);
    }
    modules[key] = {
      kind: module.kind,
      variant: shader.variant ?? null,
      wgsl: shader.wgsl,
      entryPoint: shader.entryPoint,
      workgroupSize: [...shader.workgroupSize],
      layout: descriptor.entries,
      bindings,
      samplers: shader.samplers,
      uniform: hasUniform ? uniformLayout(key, module.params, d) : null,
      io,
      paramDefaults: module.paramDefaults,
      packedDefaults
    };
  }
  return {
    format: 1,
    capabilities: CAPABILITIES,
    vertex: pool.FULLSCREEN_TRIANGLE_VERTEX,
    vertexEntryPoint: pool.FULLSCREEN_VERTEX_ENTRY,
    alphaConvert: {
      toStraight: pool.moduleKey(pool.alphaPremulToStraightV1.id, pool.alphaPremulToStraightV1.version),
      toPremultiplied: pool.moduleKey(pool.alphaStraightToPremulV1.id, pool.alphaStraightToPremulV1.version)
    },
    modules
  };
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const catalog = await buildGpuCatalog();
  const json = JSON.stringify(catalog);
  if (process.argv[2]) writeFileSync(process.argv[2], json);
  else process.stdout.write(json);
}
