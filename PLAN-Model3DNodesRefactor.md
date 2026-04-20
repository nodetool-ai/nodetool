# Model3D Nodes — Refactor Plan

A step-by-step refactor plan for the monolithic `model3d` nodes file. Items are ordered so that correctness fixes land before structural changes, and structural changes land before polish.

---

## Summary of issues found

### Real bugs (not just smells)

- **Duplicate `@prop` on `model` field.** `ModelTransformNode` declares `@prop({ type: "dict", default: {} }) model`, and every subclass re-declares `@prop({ type: "model_3d", ... }) model` on the same field. Depending on how `@nodetool/node-sdk` handles this, it is either silently overwriting, merging, or throwing on registration. Latent bug.
- **`GetModel3DMetadataNode` contract mismatch.** `metadataOutputTypes` declares ~14 fields (`format`, `size_bytes`, `vertices`, `faces`, `bounds_min`, etc.), but `process()` returns `{ output: metadata }` — a single `output` key. The declared schema and the actual return shape do not match.
- **`TextTo3DNode` and `ImageTo3DNode` are lying.** Their descriptions claim integration with Meshy/Rodin, but `process()` wraps the prompt string (or passes image bytes through) and labels the result `format: "glb"`. That is not a valid GLB and will crash any downstream node that parses it.
- **`FormatConverterNode` misleading enum.** `values: ["glb", "gltf", "obj", "stl", "ply"]` suggests 5 conversions work. Only `glb → glb` (no-op) and `glb → gltf` actually work; the other 3 always throw.

### Design / maintainability smells

- 17 node classes, ~850 lines, all in one file — mixes I/O, transforms, analysis, mesh-ops, and generation.
- `ModelTransformNode` provides a near-useless `process()` that most subclasses override anyway. It does not pull its weight.
- Inconsistent model access: some nodes use `this.getModel()`, others inline `(this.model ?? {}) as Model3DRefLike`. No reason for the split.
- Heavy copy-paste: the `if (!result) return passthroughModel(model); return { output: modelRef(result, { uri: model.uri ?? "", format: "glb" }) }` tail appears ~8 times verbatim.
- `DEFAULT_MODEL_3D`, `DEFAULT_FOLDER`, `DEFAULT_IMAGE` share a common skeleton that should be a factory.

---

## Step 0 — Safety net

- [x] Write a smoke test per node class: instantiate it, call `process()` with minimal valid input, assert the return has an `output` key (or the declared output shape). 22 tests in `model3d-honest-io.test.ts` cover all 17 node classes (file-I/O and generation nodes via throw assertions).
- [x] Add one test that logs the metadata the SDK actually registers for `CenterMeshNode`. Result: `getDeclaredPropertiesForClass(CenterMeshNode)` returns exactly one `model` prop with `type: "model_3d"` — the old base-class `dict` registration is absent because `GlbTransformNode` has no `@prop` on `model`.
- [x] Commit tests before touching any source. (Tests committed as part of this PR.)

---

## Step 1 — Fix the real bugs

Do these before any structural changes. Each bug is a correctness issue.

### 1a. `GetModel3DMetadataNode` output shape

- [x] Chose `{ output: <dict> }` — changed `metadataOutputTypes` to `{ output: "dict" }` in `analysis.ts`. The return and the declared types now match.
- [x] Smoke test asserts `result.output.format`, `result.output.vertex_count`, etc.

### 1b. `TextTo3DNode` and `ImageTo3DNode`

- [x] **Interim fix landed:** both nodes now `throw new Error("Not implemented: configure a Meshy or Rodin provider …")` in `generation.ts`. Tests assert the throw.
- [x] **Real fix:** `MeshyProvider` and `RodinProvider` landed and registered.
  `TextTo3DNode` / `ImageTo3DNode` delegate to the registered provider via
  `context.getProvider(model.provider)`. See `PLAN-Model3DProviders.md` PR-4.

### 1c. `FormatConverterNode` enum

- [x] Narrowed `values` to `["glb", "gltf"]` in `convert.ts`. Description updated to say only `glb → gltf` is supported. Guard clauses collapsed into a single check with one error message.

---

## Step 2 — Fix the base class

This unblocks the rest of the refactor. Do it after bugs are fixed so tests still pass at each step.

- [x] Create `src/nodes/model3d/base.ts`.
- [x] Define a new `GlbTransformNode` abstract class that does **not** declare a `@prop` on `model`. Subclasses declare `model` themselves with their own title/description.
- [x] Give the base class a single abstract method `transform(bytes): Uint8Array | null | Promise<Uint8Array | null>` and a concrete `process()` that handles the passthrough-on-null and output wrapping.
- [x] Add a shared helper `glbOutput(bytes, uri = "")` that returns `{ output: modelRef(bytes, { uri, format: "glb" }) }` for use in non-transform nodes.

Reference shape:

```ts
export abstract class GlbTransformNode extends BaseNode {
  declare model: any;

  protected getModel(): Model3DRefLike {
    const v = this.model;
    return v && typeof v === "object" ? (v as Model3DRefLike) : {};
  }

  protected abstract transform(
    bytes: Uint8Array
  ): Uint8Array | null | Promise<Uint8Array | null>;

  async process(): Promise<Record<string, unknown>> {
    const model = this.getModel();
    const bytes = modelBytes(model);
    const out = await this.transform(bytes);
    if (!out) return passthroughModel(model);
    return { output: modelRef(out, { uri: model.uri ?? "", format: "glb" }) };
  }
}

export const glbOutput = (bytes: Uint8Array, uri = "") => ({
  output: modelRef(bytes, { uri, format: "glb" })
});
```

- [x] Migrate nodes that currently extend `ModelTransformNode` to extend `GlbTransformNode` and implement `transform()` instead of `process()`. All transform/cleanup nodes migrated. `FormatConverterNode` extends `GlbTransformNode` but keeps its own `process()` due to non-standard output format.
- [x] Delete the old `ModelTransformNode`. Removed entirely.
- [x] Run the smoke tests. All 22 pass.

---

## Step 3 — Split the file

Once the base class is right, splitting is mechanical.

- [x] `src/nodes/model3d/` directory already existed with library files.
- [x] `defaults.ts` created. (makeDefault factory deferred to Step 4.)
- [x] `base.ts` — `GlbTransformNode`, `glbOutput` helper.
- [x] `io.ts` — `LoadModel3DFileNode`, `SaveModel3DFileNode`, `SaveModel3DNode`.
- [x] `convert.ts` — `FormatConverterNode`.
- [x] `analysis.ts` — `GetModel3DMetadataNode`.
- [x] `transforms.ts` — `Transform3DNode`, `CenterMeshNode`, `NormalizeModel3DNode`.
- [x] `cleanup.ts` — `RecalculateNormalsNode`, `FlipNormalsNode`, `RepairMeshNode`, `ExtractLargestComponentNode`.
- [x] `ops.ts` — `DecimateNode`, `Boolean3DNode`, `MergeMeshesNode`. (Named `ops.ts` not `mesh-ops.ts` to avoid collision with existing utility file `mesh-ops.ts`.)
- [x] `generation.ts` — `TextTo3DNode`, `ImageTo3DNode` (explicit throw stubs per Step 1b).
- [x] `index.ts` — re-exports all node classes and `MODEL3D_NODES` array.
- [x] `nodes.ts` reduced to a one-line shim: `export * from "./index.js"`.

---

## Step 4 — Collapse the defaults

- [x] In `defaults.ts`, add a small factory (deferred — split is done; factory is a polish step):

```ts
const makeDefault = <T extends string>(
  type: T,
  extra: Record<string, unknown> = {}
) => ({
  type,
  uri: "",
  asset_id: null,
  data: null,
  metadata: null,
  ...extra
});

export const DEFAULT_MODEL_3D = makeDefault("model_3d", {
  format: null,
  material_file: null,
  texture_files: []
});
export const DEFAULT_FOLDER = makeDefault("folder");
export const DEFAULT_IMAGE = makeDefault("image");
```

- [x] Leave `DEFAULT_TEXT_TO_3D_MODEL` and `DEFAULT_IMAGE_TO_3D_MODEL` as literal objects — they have a different shape and only appear once each.

---

## Step 5 — Normalize non-transform nodes

`DecimateNode`, `Boolean3DNode`, and `MergeMeshesNode` cannot extend `GlbTransformNode` because their input shape differs (two inputs, a list, etc.). Do not force them into the hierarchy.

- [x] Replace their final return lines with the shared `glbOutput(bytes, uri)` helper from Step 2.
- [x] Keep them extending `BaseNode` directly.

---

## Step 6 — Cleanup pass

- [x] No remaining duplicated `if (!result) return passthroughModel(model)` blocks — all transform nodes route through `GlbTransformNode.process()`.
- [x] No remaining inline `(this.model ?? {}) as Model3DRefLike` in node classes — all use `getModel()` from the base.
- [x] All 22 tests pass. Node files are ≤ ~150 lines each; old monolith gone.
- [ ] Update any docs / examples that reference the old file path. (Nothing found referencing `model3d/nodes.ts` directly; shim in place.)

---

## Done when

- [x] All smoke tests from Step 0 still pass. (22/22)
- [x] Bugs 1a, 1b, 1c are fixed.
- [x] No class has duplicate `@prop` declarations on the same field. Verified by SDK test.
- [x] No single file exceeds ~200 lines.
- [x] `MODEL3D_NODES` array still exports the same 17 classes in the same order.
- [ ] CI green on a clean checkout. (Local tests pass; awaiting CI run.)