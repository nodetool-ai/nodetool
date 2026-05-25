/**
 * Shared shader-pool contracts. Pure types + small const tuples — no WebGPU
 * runtime, Node-safe. The pool's atomic unit of reuse is a {@link
 * ShaderModule} (see `module.ts`); these are the vocabulary its fields are
 * built from.
 */

/**
 * Operation category. Drives registry grouping and (later) workflow-node
 * palette organization. Open-ended on purpose — the catalog grows across
 * phases — but the Phase 1–3 set is enumerated so typos fail typecheck.
 */
export type ShaderCategory =
  | "filters"
  | "color"
  | "keyer"
  | "mask"
  | "sources"
  | "transform"
  | "mixer"
  | "compositor"
  | "alpha"
  | "_canary";

/**
 * Stability surface. `internal` modules are free to churn; `published`
 * modules are frozen (additive-only) and are the only ones workflow nodes
 * may reference (Phase 4). Promotion is a deliberate review, never a side
 * effect of authoring a shader.
 */
export type ShaderSurface = "internal" | "published";

/**
 * Dispatch kind. `fragment` (full-screen triangle render pass) is the
 * default for image-in/image-out ops. `compute` is reserved for ops that
 * genuinely need shared memory or reductions. `snippet` is a reusable WGSL
 * fragment with no entry point of its own (resolved into other modules).
 */
export type ShaderKind = "fragment" | "compute" | "snippet";

/** Working color space a module input expects / an output is encoded in. */
export type ColorSpaceTag = "linear" | "srgb";

/**
 * Alpha association. The pool keeps alpha **premultiplied between modules**;
 * `straight` appears only at host boundaries (decode/encode).
 */
export type AlphaMode = "premultiplied" | "straight";

/**
 * How a binding is presented to WGSL. Phase 1 ships `texture_2d`; `texture_external`
 * (camera/video fast path) arrives with variants in Phase 3. Kept a string
 * enum until a module needs format/dimension discrimination (deferred).
 */
export type BindingKind = "texture_2d" | "texture_external";

/**
 * Region-of-definition propagation. Declared by every module from Phase 1;
 * the Executor does nothing with it until a real consumer (blur, crop,
 * composite) demands propagation. Declaring it now avoids retrofitting a
 * 50-module catalog later.
 */
export type RodSpec =
  | "same-as:source"
  | `expand:${string}`
  | "union-of-inputs"
  | "explicit";

/** How an output's dimensions are derived. */
export type OutputDimensions =
  | `same-as:${string}`
  | "host-specified"
  | "derived";

/** A declared texture input. `"source"` and `"mask"` are reserved names. */
export interface InputContract {
  colorSpace: ColorSpaceTag;
  alpha: AlphaMode;
  bindingKinds: readonly BindingKind[];
  /** Optional inputs sample as fully-covered (mask → 1.0) when unbound. */
  optional?: boolean;
}

/** The declared output of a module. */
export interface OutputContract {
  colorSpace: ColorSpaceTag;
  alpha: AlphaMode;
  format: GPUTextureFormat;
  dimensions: OutputDimensions;
}

/**
 * I/O contract. The Executor validates bound {@link LabeledTexture}s against
 * this at encode time; mismatches fail loud or route through a registered
 * conversion (later phases). Source modules declare `inputs: {}`.
 */
export interface IOContract {
  inputs: Record<string, InputContract>;
  output: OutputContract;
  rod: RodSpec;
}

/**
 * Non-semantic UI hint for a param (min/max/step/notes). Carries no runtime
 * meaning — the TypeGPU schema is the source of truth for layout and type.
 */
export interface UiHint {
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  notes?: string;
}
