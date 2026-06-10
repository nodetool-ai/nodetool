/**
 * `RecipeModule` + `RecipeRunner` — multi-pass orchestration.
 *
 * A recipe module is a registry-visible operation whose work is expressed as
 * a small DAG of single-pass `ShaderModule` invocations rather than a single
 * shader. `RecipeRunner.encode` walks the passes, acquires intermediate
 * textures from `ctx.scratch`, dispatches each pass through the shared
 * `Executor`, and releases intermediates in reverse order on return.
 *
 * Intermediate formats are declared in the module — not chosen by the host —
 * so a recipe like `filters.glow` produces the same output everywhere.
 *
 * Like `Executor.encode`, the runner encodes GPU work only: no readback, no
 * `copyTextureToBuffer`, no `mapAsync`. The host owns submission and the
 * final output texture's lifetime.
 */

import type { GPUContext, ScratchSpec } from "./context.js";
import type { Executor, ExecutorDispatch } from "./executor.js";
import { createExecutor } from "./executor.js";
import { moduleKey, type ShaderModule } from "./module.js";
import type { ShaderRegistry } from "./registry.js";
import type { LabeledTexture } from "./texture.js";
import type {
  IOContract,
  ShaderCategory,
  ShaderSurface,
  UiHint
} from "./types.js";

/** A JSON path into the recipe's params, e.g. `"$.radius"`. */
export type ParamRef = `$.${string}`;

/** Intermediate texture specification. Sizes default to the input source. */
export interface IntermediateSpec {
  format: GPUTextureFormat;
  usage: GPUTextureUsageFlags;
  /** Defaults to the source dimensions if omitted. */
  width?: number;
  height?: number;
  label?: string;
}

/** A single Executor dispatch inside a recipe. */
export interface RecipePass {
  /** `(id, version)` of the `ShaderModule` to invoke. */
  op: { id: string; version: number };
  /**
   * Map a module input name to either `"source"` (the recipe's main input,
   * the same `source` the recipe was called with) or a named intermediate.
   * Use `{ name, from }` to bind a recipe input under a different key — that
   * supports `mask` and other non-`source` slots without forcing renames.
   */
  in: Record<string, "source" | { kind: "intermediate"; name: string } | { kind: "input"; name: string }>;
  /** `"output"` (the recipe's final target) or a named intermediate. */
  out: "output" | { kind: "intermediate"; name: string };
  /** Param values: literals or `ParamRef`s into the recipe's params object. */
  params: Record<string, ParamRef | unknown>;
  /**
   * Compute dispatch sizing. Fragment passes omit it (always full-screen).
   * If the workgroup size is `[wx, wy, 1]`, set `kind: "compute"` and the
   * runner derives `(ceil(width/wx), ceil(height/wy))` from the **output**
   * texture's dimensions; pass an explicit `x`/`y` to override.
   */
  dispatch?:
    | { kind: "fragment" }
    | { kind: "compute"; x?: number; y?: number; z?: number };
}

/** Declarative recipe payload bundled with a {@link RecipeModule}. */
export interface Recipe<Params> {
  intermediates: Record<string, IntermediateSpec>;
  passes: readonly RecipePass[];
  /**
   * Optional resolver. Default uses the `(id, version)` registry. Recipes
   * may pass a partial registry (a `Map`) for unit testing.
   */
  resolve?: (op: { id: string; version: number }) => ShaderModule;
  /**
   * Optional type-only marker so `Recipe<P>` instances retain the params type
   * after registration. Never read at runtime.
   */
  readonly _params?: Params;
}

/**
 * A module whose execution is a recipe of single-pass `ShaderModule` calls.
 * Lives in the same registry as `ShaderModule` (Phase 3 onward), but has no
 * own WGSL — its `kind` is `"recipe"`.
 */
export interface RecipeModule<Params = Record<string, unknown>> {
  readonly id: string;
  readonly version: number;
  readonly surface: ShaderSurface;
  readonly category: ShaderCategory;
  readonly kind: "recipe";

  readonly paramDefaults: Params;
  readonly paramUi?: Readonly<Record<string, UiHint>>;

  readonly io: IOContract;
  readonly recipe: Recipe<Params>;
}

/** Build a frozen {@link RecipeModule}. */
export function defineRecipe<Params>(spec: {
  id: string;
  version: number;
  surface: ShaderSurface;
  category: ShaderCategory;
  paramDefaults: Params;
  paramUi?: Record<string, UiHint>;
  io: IOContract;
  recipe: Recipe<Params>;
}): RecipeModule<Params> {
  if (!spec.id) {
    throw new Error("defineRecipe: id is required");
  }
  if (!Number.isInteger(spec.version) || spec.version < 1) {
    throw new Error(
      `defineRecipe(${spec.id}): version must be a positive integer`
    );
  }
  if (spec.recipe.passes.length === 0) {
    throw new Error(`defineRecipe(${spec.id}): recipe must have ≥1 pass`);
  }
  return Object.freeze({
    id: spec.id,
    version: spec.version,
    surface: spec.surface,
    category: spec.category,
    kind: "recipe" as const,
    paramDefaults: spec.paramDefaults,
    paramUi: spec.paramUi,
    io: spec.io,
    recipe: spec.recipe
  });
}

/** Run a recipe end-to-end against a context, encoder, and output target. */
export interface RecipeRunner {
  encode<P>(args: {
    ctx: GPUContext;
    module: RecipeModule<P>;
    encoder: GPUCommandEncoder;
    inputs: Record<string, LabeledTexture>;
    output: LabeledTexture;
    params: P;
    /** Optional registry for op resolution; falls back to `recipe.resolve`. */
    registry?: ShaderRegistry;
    /** Optional executor; default `createExecutor()` is fine for most cases. */
    executor?: Executor;
  }): void;
}

function readPath(obj: Record<string, unknown>, path: ParamRef): unknown {
  // Strip leading `$.`; recipes are intentionally shallow (no nesting yet).
  const key = path.slice(2);
  return obj[key];
}

function resolveParams(
  raw: Record<string, ParamRef | unknown>,
  recipeParams: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (typeof value === "string" && value.startsWith("$.")) {
      out[name] = readPath(recipeParams, value as ParamRef);
    } else {
      out[name] = value;
    }
  }
  return out;
}

function resolveOp(
  pass: RecipePass,
  recipe: Recipe<unknown>,
  registry: ShaderRegistry | undefined,
  recipeKey: string
): ShaderModule {
  if (recipe.resolve) {
    return recipe.resolve(pass.op);
  }
  if (!registry) {
    throw new Error(
      `RecipeRunner(${recipeKey}): no registry or recipe.resolve to resolve ${pass.op.id}@${pass.op.version}`
    );
  }
  return registry.get(pass.op) as ShaderModule;
}

/** Default {@link RecipeRunner}: scratch-pool intermediates, sequential passes. */
export function createRecipeRunner(): RecipeRunner {
  return {
    encode({ ctx, module, encoder, inputs, output, params, registry, executor }) {
      const ex = executor ?? createExecutor();
      const recipe = module.recipe;
      const key = moduleKey(module.id, module.version);

      const source = inputs.source;
      if (!source) {
        throw new Error(`RecipeRunner(${key}): missing "source" input`);
      }

      // Resolve intermediates, defaulting unspecified dimensions to source.
      const intermediates = new Map<string, LabeledTexture>();
      const acquired: LabeledTexture[] = [];
      for (const [name, spec] of Object.entries(recipe.intermediates)) {
        const fullSpec: ScratchSpec = {
          width: spec.width ?? source.width,
          height: spec.height ?? source.height,
          // Exact size, not bucketed: passes derive dispatch size and texel
          // bounds from the texture's physical dimensions, and fragment
          // passes always cover the whole attachment. A bucketed intermediate
          // therefore either leaves an unwritten margin that the next pass's
          // clamped taps blend in (compute) or stretches the image to the
          // bucket and back, rescaling pixel-unit params like blur radius
          // (fragment). Physical size must equal logical size.
          exact: true,
          format: spec.format,
          usage: spec.usage,
          label: spec.label ?? `${key}-${name}`
        };
        const tex = ctx.scratch.acquire(fullSpec);
        intermediates.set(name, tex);
        acquired.push(tex);
      }

      try {
        for (const pass of recipe.passes) {
          const op = resolveOp(pass, recipe, registry, key);
          // Map declared `in` bindings to actual labeled textures.
          const passInputs: Record<string, LabeledTexture> = {};
          for (const [bindName, ref] of Object.entries(pass.in)) {
            if (ref === "source") {
              passInputs[bindName] = source;
              continue;
            }
            if (ref.kind === "intermediate") {
              const tex = intermediates.get(ref.name);
              if (!tex) {
                throw new Error(
                  `RecipeRunner(${key}): unknown intermediate "${ref.name}"`
                );
              }
              passInputs[bindName] = tex;
              continue;
            }
            // ref.kind === "input"
            const tex = inputs[ref.name];
            if (!tex) {
              throw new Error(
                `RecipeRunner(${key}): pass binds "${bindName}" to recipe input "${ref.name}" but that input is unbound`
              );
            }
            passInputs[bindName] = tex;
          }
          const target =
            pass.out === "output"
              ? output
              : intermediates.get(pass.out.name) ??
                (() => {
                  throw new Error(
                    `RecipeRunner(${key}): unknown intermediate "${pass.out.name}"`
                  );
                })();
          const resolvedParams = resolveParams(
            pass.params,
            params as Record<string, unknown>
          );
          const dispatch = resolveDispatch(pass, op, target);
          ex.encode({
            ctx,
            module: op,
            encoder,
            inputs: passInputs,
            output: target,
            params: resolvedParams,
            dispatch
          });
        }
      } finally {
        for (const tex of acquired.reverse()) {
          ctx.scratch.release(tex);
        }
      }
    }
  };
}

function resolveDispatch(
  pass: RecipePass,
  op: ShaderModule,
  target: LabeledTexture
): ExecutorDispatch {
  if (op.kind === "fragment") {
    return { kind: "fragment" };
  }
  if (op.kind !== "compute") {
    throw new Error(
      `RecipeRunner: op "${op.id}@${op.version}" has unsupported kind "${op.kind}"`
    );
  }
  const dispatch = pass.dispatch;
  if (dispatch && dispatch.kind === "compute") {
    const [wx, wy] = op.workgroupSize;
    return {
      kind: "compute",
      x: dispatch.x ?? Math.ceil(target.width / wx),
      y: dispatch.y ?? Math.ceil(target.height / wy),
      z: dispatch.z ?? 1
    };
  }
  const [wx, wy] = op.workgroupSize;
  return {
    kind: "compute",
    x: Math.ceil(target.width / wx),
    y: Math.ceil(target.height / wy),
    z: 1
  };
}
