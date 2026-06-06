/**
 * `ShaderModule` — the atomic unit of reuse in the shared shader pool.
 *
 * A module bundles hand-written WGSL with a TypeGPU bind group layout, a
 * TypeGPU `d.struct` uniform schema, sampler descriptors, and a declared I/O
 * contract. There is no way to import "just the WGSL": the layout, the
 * uniform packer, and the I/O contract travel with it so later phases never
 * re-derive uniform layouts or bind group layouts by hand.
 *
 * WGSL stays hand-written; {@link defineModule} runs `tgpu.resolve(...)` to
 * connect it to the typed layout (the TS-to-WGSL compiler is not adopted).
 */

import tgpu from "typegpu";
import type { TgpuBindGroupLayout } from "typegpu";
import type { AnyWgslStruct, Infer } from "typegpu/data";
import type {
  BindingKind,
  IOContract,
  LinearityMode,
  ShaderCategory,
  ShaderKind,
  ShaderSurface,
  UiHint
} from "./types.js";
import { validateWgslLinearity } from "./validate/wgslLinearity.js";

/** Host-capability constraints a variant requires (Phase 3 scaffolding). */
export interface VariantRequirements {
  /** Requires `texture_external` binding (browser camera/video fast path). */
  textureExternal?: boolean;
  /** Requires `shader-f16` feature (half-precision storage). */
  f16Storage?: boolean;
}

/**
 * Alternate `(layout, wgsl, entryPoint, samplers, workgroupSize)` for the
 * same `ShaderModule`. Added in Phase 3 to handle distinct binding kinds
 * (e.g. `texture_external` vs `texture_2d` for camera/video) without
 * spawning duplicate module ids.
 *
 * Variants only appear when a concrete second binding kind / capability /
 * quality split exists; modules without alternatives leave `variants`
 * undefined and the Executor uses the module's primary layout.
 */
export interface ShaderVariant {
  /** Stable short name (`"external"`, `"f16"`). */
  readonly name: string;
  /** Binding kind the variant's main input expects, by input name. */
  readonly bindingKinds?: Readonly<Record<string, BindingKind>>;
  /** Required device capabilities. */
  readonly requires?: VariantRequirements;
  readonly layout: TgpuBindGroupLayout;
  readonly wgsl: string;
  readonly entryPoint: string;
  readonly samplers?: Readonly<Record<string, GPUSamplerDescriptor>>;
  readonly workgroupSize?: readonly [number, number, number];
}

/** Default key, within a module's layout, that holds the params uniform. */
export const DEFAULT_UNIFORM_BINDING = "params";

/**
 * A registered, version-pinned GPU operation. Identity is `(id, version)`;
 * renames/splits ship as a new version, never in-place.
 */
export interface ShaderModule<Schema extends AnyWgslStruct = AnyWgslStruct> {
  readonly id: string;
  readonly version: number;
  readonly surface: ShaderSurface;
  readonly category: ShaderCategory;
  readonly kind: ShaderKind;
  /**
   * Premul-invariant classification. Drives the static WGSL validator
   * (load-time) and runtime debug pass (per-dispatch). See
   * {@link LinearityMode}.
   */
  readonly linearity: LinearityMode;

  /** TypeGPU uniform schema — source of truth for the WGSL struct + packer. */
  readonly params: Schema;
  readonly paramDefaults: Infer<Schema>;
  readonly paramUi?: Readonly<Record<string, UiHint>>;

  /** TypeGPU bind group layout; `root.unwrap(layout)` is the GPU layout. */
  readonly layout: TgpuBindGroupLayout;
  /** Layout key holding the params uniform (`""` if the module has none). */
  readonly uniformBinding: string;
  /** Sampler descriptors bundled with the module, keyed by layout binding. */
  readonly samplers: Readonly<Record<string, GPUSamplerDescriptor>>;

  /** Resolved WGSL (layout + uniform struct injected). */
  readonly wgsl: string;
  readonly entryPoint: string;
  readonly workgroupSize: readonly [number, number, number];

  readonly io: IOContract;
  /**
   * Alternate `(layout, wgsl, ...)` for distinct binding kinds or
   * capabilities. Resolved by the Executor against bound inputs and
   * `GPUContext.capabilities`. `undefined` ⇒ the module's primary
   * `(layout, wgsl, entryPoint, samplers)` is the only variant.
   */
  readonly variants?: readonly ShaderVariant[];
}

/** Authoring input for {@link defineModule}. */
export interface ShaderModuleSpec<Schema extends AnyWgslStruct> {
  id: string;
  version: number;
  surface: ShaderSurface;
  category: ShaderCategory;
  /** Defaults to `"fragment"` — the image-in/image-out default. */
  kind?: ShaderKind;
  /**
   * Premul-invariant classification. Required — no default, so shader
   * authors must classify their RGB math explicitly. See {@link LinearityMode}.
   */
  linearity: LinearityMode;

  params: Schema;
  paramDefaults: Infer<Schema>;
  paramUi?: Record<string, UiHint>;

  layout: TgpuBindGroupLayout;
  /** Layout key for the params uniform. Defaults to `"params"`. */
  uniformBinding?: string;
  samplers?: Record<string, GPUSamplerDescriptor>;

  /**
   * Hand-written WGSL template referencing the layout (and any extra
   * `externals`) by name. `tgpu.resolve` replaces those references with the
   * generated bindings + struct definitions.
   */
  wgsl: string;
  /** Extra resolve externals (shared snippets). The layout is auto-included. */
  externals?: Record<string, object>;

  /** Fragment entry point. Defaults to `"fs_main"` (fragment) / `"main"`. */
  entryPoint?: string;
  /** Compute workgroup size. Ignored for fragment modules. */
  workgroupSize?: readonly [number, number, number];

  io: IOContract;

  /**
   * Alternate-binding variants (Phase 3). Each variant gets its own resolved
   * WGSL: `defineModule` runs `tgpu.resolve` over `variant.wgsl` with that
   * variant's layout in scope, so the resolved string in the returned module
   * already has variant-correct bindings injected.
   */
  variants?: ReadonlyArray<{
    name: string;
    bindingKinds?: Record<string, BindingKind>;
    requires?: VariantRequirements;
    layout: TgpuBindGroupLayout;
    wgsl: string;
    externals?: Record<string, object>;
    entryPoint?: string;
    samplers?: Record<string, GPUSamplerDescriptor>;
    workgroupSize?: readonly [number, number, number];
    /**
     * Opt out of `tgpu.resolve` for this variant's WGSL. Needed for bindings
     * TypeGPU's resolver can't inline (e.g. `texture_external`); the variant
     * supplies fully-formed WGSL with hand-written `@group/@binding` decls.
     * Defaults to `false` (the primary path runs resolve).
     */
    rawWgsl?: boolean;
  }>;
}

/**
 * Build a {@link ShaderModule}, resolving its WGSL against the typed layout
 * at definition time. Resolution is device-free (pure string generation), so
 * this runs at module load — failures surface before any GPU work.
 */
export function defineModule<Schema extends AnyWgslStruct>(
  spec: ShaderModuleSpec<Schema>
): ShaderModule<Schema> {
  if (!spec.id) {
    throw new Error("defineModule: id is required");
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    throw new Error(
      `defineModule(${spec.id}): version must be a positive integer`
    );
  }

  const kind = spec.kind ?? "fragment";
  const wgsl = tgpu.resolve({
    template: spec.wgsl,
    externals: { layout: spec.layout, ...spec.externals },
    names: "strict"
  });

  // Item 3 of the invariant-enforcement plan: static premul check against the
  // declared `linearity` tag, run on the resolved WGSL so it sees the final
  // bindings. Failures throw — a misclassified module never reaches the
  // registry. `NODETOOL_GPU_VALIDATE=off` disables it for emergency hotfixes.
  const linearityCheck = validateWgslLinearity({
    id: spec.id,
    linearity: spec.linearity,
    wgsl,
    inputs: spec.io.inputs
  });
  if (!linearityCheck.ok) {
    throw new Error(
      `defineModule(${spec.id}): premul-invariant validation failed:\n  - ${linearityCheck.violations.join("\n  - ")}`
    );
  }

  const variants = spec.variants?.map<ShaderVariant>((v) => {
    const variantWgsl = v.rawWgsl
      ? v.wgsl
      : tgpu.resolve({
          template: v.wgsl,
          externals: { layout: v.layout, ...v.externals },
          names: "strict"
        });
    const variantCheck = validateWgslLinearity({
      id: `${spec.id}#${v.name}`,
      linearity: spec.linearity,
      wgsl: variantWgsl,
      inputs: spec.io.inputs
    });
    if (!variantCheck.ok) {
      throw new Error(
        `defineModule(${spec.id}, variant=${v.name}): premul-invariant validation failed:\n  - ${variantCheck.violations.join("\n  - ")}`
      );
    }
    return Object.freeze({
      name: v.name,
      bindingKinds: v.bindingKinds,
      requires: v.requires,
      layout: v.layout,
      wgsl: variantWgsl,
      entryPoint: v.entryPoint ?? (kind === "compute" ? "main" : "fs_main"),
      samplers: v.samplers,
      workgroupSize: v.workgroupSize
    });
  });

  return Object.freeze({
    id: spec.id,
    version: spec.version,
    surface: spec.surface,
    category: spec.category,
    kind,
    linearity: spec.linearity,
    params: spec.params,
    paramDefaults: spec.paramDefaults,
    paramUi: spec.paramUi,
    layout: spec.layout,
    uniformBinding: spec.uniformBinding ?? DEFAULT_UNIFORM_BINDING,
    samplers: spec.samplers ?? {},
    wgsl,
    entryPoint: spec.entryPoint ?? (kind === "compute" ? "main" : "fs_main"),
    workgroupSize: spec.workgroupSize ?? ([1, 1, 1] as const),
    io: spec.io,
    variants: variants ? Object.freeze(variants) : undefined
  });
}

/** `(id, version)` rendered as a stable string key. */
export function moduleKey(id: string, version: number): string {
  return `${id}@${version}`;
}
