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
  IOContract,
  ShaderCategory,
  ShaderKind,
  ShaderSurface,
  UiHint
} from "./types.js";

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
}

/** Authoring input for {@link defineModule}. */
export interface ShaderModuleSpec<Schema extends AnyWgslStruct> {
  id: string;
  version: number;
  surface: ShaderSurface;
  category: ShaderCategory;
  /** Defaults to `"fragment"` — the image-in/image-out default. */
  kind?: ShaderKind;

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

  return Object.freeze({
    id: spec.id,
    version: spec.version,
    surface: spec.surface,
    category: spec.category,
    kind,
    params: spec.params,
    paramDefaults: spec.paramDefaults,
    paramUi: spec.paramUi,
    layout: spec.layout,
    uniformBinding: spec.uniformBinding ?? DEFAULT_UNIFORM_BINDING,
    samplers: spec.samplers ?? {},
    wgsl,
    entryPoint: spec.entryPoint ?? (kind === "compute" ? "main" : "fs_main"),
    workgroupSize: spec.workgroupSize ?? ([1, 1, 1] as const),
    io: spec.io
  });
}

/** `(id, version)` rendered as a stable string key. */
export function moduleKey(id: string, version: number): string {
  return `${id}@${version}`;
}
