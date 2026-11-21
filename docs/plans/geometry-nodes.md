# Geometry nodes: product requirements

This document specifies procedural geometry in NodeTool workflows: nodes that
build and change meshes, curves, point clouds and instances, with values that
vary per element. The model is Blender's Geometry Nodes. The implementation is
a TypeScript geometry core that connects to the existing `model_3d` (glTF)
stack through two conversion nodes.

Cross-plan references use `GN-`, for example `GN-D2`. References to the
control-flow regions plan use `CF-`, for example `CF-D3`.

Citations are relative to the repository root at `e2e4fb9519`. Statements
about Blender (`GeometrySet`, fields, anonymous attributes, zones) come from
knowledge of its source layout. No Blender source or documentation was fetched
for this document.

## 1. Problem

A creator can generate, repair, transform, boolean and render a 3D model in a
workflow today. Every one of those nodes treats the model as one GLB file. A
creator cannot scatter instances over a surface, displace vertices by a noise
value, or delete faces by a condition. That work happens in Blender, outside
the workflow, and the result returns as a file that no upstream node can
change.

The `nodetool.blender` nodes do not close the gap. They render and convert,
they start a Blender process for each run, they need a local install, and they
are off on cloud deployments ([Blender Nodes](../blender.md)).

## 2. Solution

Geometry nodes are ordinary workflow nodes in a `nodetool.geometry` namespace.
A `geometry` value flows between them. Field nodes (Position, Noise, Math)
describe a value per element and cost nothing until a geometry node evaluates
them. `ToModel3D` and `FromModel3D` connect a geometry to every surface that
already reads `model_3d`. The node output shows the geometry in a viewport, and
a Viewer node shows any field as colors and as a table.

The first release must run each graph in this table on a server with no
Blender installed.

| Case | Graph | Result |
|---|---|---|
| Scatter | `Grid ▶ Distribute Points on Faces ▶ Instance on Points ◀ Cube`, with `Random Value` on Scale, then `Realize Instances ▶ ToModel3D ▶ RenderToImage` | An image of the scattered cubes |
| Displace | `Grid ▶ Set Position`, with Offset from `Normal × Noise(Position)` | A displaced mesh in the node's output viewport |
| Cut | `Cube` and `UV Sphere` into `Mesh Boolean` (difference), then `ToModel3D ▶ SaveModel3D` | A GLB asset that opens in the 3D Editor |
| Inspect | Any geometry and a field into `Viewer` | The viewport colored by the field, and a table of the attribute values for each domain |

Goals:

- G1. A creator builds the four graphs above from the node menu without
  leaving NodeTool.
- G2. The same graph gives the same geometry on the server, in a browser
  worker and on a cloud deployment.
- G3. Every existing `model_3d` consumer accepts geometry-node output through
  `ToModel3D` with no change to that consumer.
- G4. An agent can build, run and inspect a geometry graph with no editor
  open ([Harness-First rules](../HARNESS_FIRST.md#the-rules)).

## 3. Terms

| Term | Meaning |
|---|---|
| Geometry | A value with up to four components: mesh, curves, point cloud, instances |
| Domain | The element kind an attribute belongs to: point, edge, face, corner, curve or instance |
| Attribute | A named typed array with one value for each element of one domain |
| Field | A deferred function from an element to a value. It is an expression, not an array |
| Evaluation | Computing a field over one domain of one geometry, which gives an array |
| Anonymous attribute | A hidden attribute that a geometry node writes so that a field output can refer to it |
| Bridge | The `ToModel3D` and `FromModel3D` nodes |

## 4. User stories

- U1. A creator adds a primitive (Grid, Cube, UV Sphere, Cylinder, Line, Curve
  Circle, Points) and sees it in the node's output viewport after a run.
- U2. A creator connects Position, Noise and Math nodes into Set Position and
  the mesh moves per vertex. The field nodes show no geometry and report no
  cost.
- U3. A creator connects a number to a field input and it applies to every
  element. A connection from a field output to a number input is refused in
  the editor, and `nodetool validate` reports it with the edge and both types.
- U4. A creator scatters points on a mesh, instances a second geometry on
  them, and varies scale or rotation per instance with Random Value. The same
  seed gives the same result on every run and every host.
- U5. A creator connects a geometry and a field to a Viewer node and reads the
  values in a table, one tab for each domain. This is how the creator finds
  out why a field does not do what was expected.
- U6. A creator converts a geometry with `ToModel3D` and sends it to
  `RenderToImage`, Blender `RenderImage`, `SaveModel3D`, the 3D Editor or a
  timeline 3D clip. A creator loads a GLB with `FromModel3D` and changes it
  with geometry nodes.
- U7. A creator who exceeds the element limit of a node gets an error that
  names the count and the limit before the server runs out of memory (GN-D16).
- U8. An agent runs `nodetool node run nodetool.geometry.Grid` and reads
  element counts and bounds from the result. It reads attribute values through
  the Viewer node's table output.
- U9. A developer imports `@nodetool-ai/geometry` in a package with no DOM and
  no Node API and evaluates a field over a mesh.

## 5. Starting point

- F1. The 3D type is `model_3d`, a ref to a GLB or glTF file
  (`Model3DRef` in [`api-types.ts`](../../packages/protocol/src/api-types.ts)).
  [`@nodetool-ai/model3d`](../../packages/model3d/README.md) reads, edits and
  validates the glTF scene document and does no rendering.
- F2. The `nodetool.model3d.*` nodes live in
  [`packages/video-nodes/src/nodes/model3d/`](../../packages/video-nodes/src/nodes/model3d/).
  They cover load, save, format conversion, `Transform3D`, `Decimate`,
  `Boolean3D`, `MergeMeshes`, mesh cleanup, `RenderToImage` and generation.
  None of them exposes a per-element value.
- F3. `manifold-3d` and `three` are dependencies of `packages/video-nodes`.
  `Boolean3D` already runs on Manifold
  ([`boolean-ops.ts`](../../packages/video-nodes/src/nodes/model3d/boolean-ops.ts)).
  `web` depends on `three` and `@react-three/fiber`.
- F4. No vector type exists. `Transform3D` declares nine `float` properties
  for translate, rotate and scale
  ([`transforms.ts`](../../packages/video-nodes/src/nodes/model3d/transforms.ts)).
  The data type registry in
  [`data_types.ts`](../../web/src/config/data_types.ts) has no entry for a
  vector, a quaternion, a matrix or a material.
- F5. The node output shows `model_3d` through `LazyModel3DViewer`, which
  loads a signed URL
  ([`OutputRenderer.tsx`](../../web/src/components/node/OutputRenderer.tsx)).
  The same file renders `dataframe` through `DataframeRenderer`.
- F6. The run context keeps `memory://` objects in a cache, and
  `sanitizeForClient` blanks a `memory://` URI before a value reaches the
  client unless the value carries `data` or an `asset_id`
  ([`context.ts`](../../packages/runtime/src/context.ts)). A geometry held in
  memory therefore needs an explicit path to the client.
- F7. Three places decide whether two types connect: `isConnectable` in
  [`TypeHandler.ts`](../../web/src/utils/TypeHandler.ts) for the editor,
  `typesIncompatible` in
  [`type-compat.ts`](../../packages/node-sdk/src/type-compat.ts) for
  `nodetool validate`, and `typesCompatible` in
  [`graph-utils.ts`](../../packages/execution-core/src/graph-utils.ts) for
  bypass routing. `isConnectable` already lets `T` connect to `list[T]`.
  `typesIncompatible` skips every type that has type arguments, so it would
  accept `field[float]` into `float` today.
- F8. The realtime compiler carries deferred values as a serializable
  expression tree, `{ kind: "operation", op, inputs }`
  (`ControlExpression` in
  [`Types.ts`](../../packages/realtime-compiler/src/Types.ts)).
- F9. [`@nodetool-ai/kernels`](../../packages/kernels/README.md) runs C++ loops
  as WebAssembly on the server and in the browser, with parity tests against
  the TypeScript loop each kernel replaced.
- F10. The cloud profile allowlists namespaces. `nodetool.model3d` is on the
  list and `nodetool.blender` is not
  ([`cloud-profile.ts`](../../packages/protocol/src/cloud-profile.ts)).
- F11. The For Each Region with State for next item is specified in
  [control-flow regions](control-flow-regions.md) (CF-D3, CF-D18). A search of
  `packages/*/src` for `ForEachRegion` and `for_each_region` finds no
  implementation.

## 6. Options

- O1. Run Blender for every evaluation. It matches Blender exactly and
  `blender-nodes` already runs Blender headless. Each run starts a process, a
  Blender install is required, and the nodes are off on cloud deployments. A
  slider drag cannot show a result.
- O2. Port Blender's C++. The license allows it: GPL-2.0-or-later code can be
  used under GPLv3, which combines with AGPLv3. The node code depends on
  Blender's internal libraries and its threading, so a port is a rewrite.
- O3. Reimplement the data model and the field semantics in TypeScript. It
  runs on the server, in a browser worker and in the sandbox. Hot loops can
  move to C++ compiled to WebAssembly through the kernels path (F9) when a
  measurement asks for it.

**Decision: O3.** O1 survives as an optional backend (GN-D12).

## 7. Decisions

### Types

**D1. A `geometry` value modelled on Blender's `GeometrySet`.** It holds at
most one component of each kind. All data lives in columnar typed arrays.

```ts
type Domain = "point" | "edge" | "face" | "corner" | "curve" | "instance";
type AttrType = "float" | "int" | "bool" | "int8" | "float2" | "float3"
              | "color" | "quaternion" | "float4x4";

interface Attribute { domain: Domain; type: AttrType; data: Float32Array | Int32Array | Uint8Array }

interface Mesh {
  pointCount: number;
  edgeVerts: Int32Array;     // 2 per edge
  faceOffsets: Int32Array;   // CSR into corners
  cornerVerts: Int32Array;
  attributes: Record<string, Attribute>; // "position" is point/float3
  materials: MaterialSlot[];
}
interface Curves     { curveOffsets: Int32Array; attributes: Record<string, Attribute> } // position, radius, tilt, cyclic
interface PointCloud { attributes: Record<string, Attribute> }                           // position, radius
interface Instances  { transforms: Float32Array; refIndex: Int32Array; refs: Geometry[]; attributes: Record<string, Attribute> }

interface Geometry { mesh?: Mesh; curves?: Curves; points?: PointCloud; instances?: Instances }
```

Nodes share attribute arrays and copy an array only when they change it. A
node never mutates an array it received. Without this rule every node copies
the whole mesh.

**D2. A `field` value carried as a serializable expression tree.**

```ts
type Field =
  | { kind: "const"; type: AttrType; value: unknown }
  | { kind: "input"; name: "position" | "normal" | "index" | "id" }
  | { kind: "attr"; name: string; type: AttrType }
  | { kind: "anon"; id: string; type: AttrType }   // e.g. Extrude Mesh "Top"
  | { kind: "op"; op: string; args: Field[]; params?: Record<string, unknown> };
```

Field nodes only build this tree. The geometry node that consumes a field
evaluates it over arrays, one operation for each column. When an attribute's
domain differs from the evaluation domain, the evaluator interpolates between
them as Blender does, for example by averaging point values onto a face.

In type metadata a field is `field` with one type argument, for example
`field[float]`. The connection rules are:

- A `T` output connects to a `field[T]` input and acts as a constant field.
- A `field[T]` output never connects to a `T` input.
- A field input left unconnected uses its implicit field. Set Position's
  Position input defaults to the Position field.

The first release narrows Blender's dynamic socket shape. An output of a
`nodetool.geometry` field node is always `field[T]`, and scalar arithmetic
stays on the existing math nodes. An output whose type depends on its
connections would need type inference in all three checkers (F7).

The editor draws field handles with a different shape from value handles.

**D3. Anonymous attributes.** A geometry node with field outputs, such as
Extrude Mesh's Top and Side, writes a hidden attribute
`.anon.<nodeId>.<output>` into its output geometry and returns
`{ kind: "anon", id }` on the field output. `ToModel3D` strips these
attributes. Evaluating an anonymous field on a geometry that does not carry
the attribute is an error that names the producing node.

**D4. Supporting value types.** Add `vector3`, `rotation` (quaternion),
`matrix` (4x4) and `material`. Object and Collection inputs in Blender map to
`model_3d` refs through `FromModel3D`. The existing `Transform3D` keeps its
nine `float` properties (F4).

**D5. `GeometryRef`.** Add
`{ type: "geometry"; uri; asset_id?; temp_id?; summary? }` to
[`api-types.ts`](../../packages/protocol/src/api-types.ts). The summary holds
the element counts for each component and the bounds. Between nodes the
geometry stays in the run context's `memory://` cache (F6). It is serialized
only when it goes to the client or is saved. The file format is `.ntgeo`, a
columnar MsgPack format, because glTF cannot hold edges, curves or attributes
on arbitrary domains without loss. The ref follows the
[resource ID principles](../../AGENTS.md#resource-id-principles).

### Execution

**D6. Each geometry node is an ordinary NodeTool node.** It has `geometry`
inputs and outputs and field inputs. This fits the actor model with no engine
change. The only shared code that changes is the three connection checkers
(F7).

**D7. Zones.** The Repeat zone maps to the For Each Region with State for
next item (CF-D3, CF-D18). It ships after that region does (F11). The
Simulation zone and For Each Element are later work. Simulation needs frame
stepping, which the timeline would drive.

**D13. Two packages.** `packages/geometry` is the pure core with no DOM and no
Node API: the data model, the field evaluator, domain interpolation and the
`.ntgeo` codec. `packages/geometry-nodes` holds the node definitions and
depends on the core, `manifold-3d` and `@nodetool-ai/model3d`. Both follow the
[package dependency order](../../packages/AGENTS.md#package-dependency-order).

**D14. Cloud profile.** `nodetool.geometry` joins the cloud allowlist (F10).
The nodes use no host binary, no file system path and no network.

**D15. Determinism.** Random Value and Noise take a seed and use integer
hashing. The same graph and seed give byte-equal attribute arrays on the
server and in a browser worker. GN-D11 depends on this.

**D16. Element limit.** A node that would produce more elements than the limit
fails before it allocates, with an error that names the count and the limit.
GN-A1 sets the default.

### Rendering and inspection

**D8. Node output preview.** Add a `geometry` case to `OutputRenderer.tsx` on
`@react-three/fiber`. It builds `BufferGeometry` from the attribute arrays
with no glTF round trip.

- A mesh with face or corner attributes splits vertices by corner.
- A point cloud becomes `THREE.Points`, sized from radius.
- Curves become line segments.
- Instances become `InstancedMesh`.

Every geometry output sends its summary. A Viewer node sends the full
geometry, written to temporary storage and loaded through a signed URL as
`model_3d` is (F5, F6). A preview above the size threshold is decimated and
labelled as decimated. GN-A2 sets the threshold. GN-Q4 asks which other
outputs send a full payload.

**D9. A Viewer node and an attribute table.** The Viewer node takes a geometry
and an optional field. It colors the viewport by the field's values and shows
a table for each domain through the existing `DataframeRenderer`. The table is
also a `dataframe` output, so an agent reads it without a browser (G4).

**D10. The bridge.** `ToModel3D` writes GLB: meshes as primitives, custom
attributes as `_NAME`, and curves as line primitives or tube meshes. Its
`instancing` option is `realize` or `gpu_instancing`
(`EXT_mesh_gpu_instancing`). The default is `realize` until GN-A4 shows that
every consumer reads the extension. `FromModel3D` reads GLB into a geometry.
`ToModel3D` output must pass `validateModel3D`.

**D11. Live preview, later.** Blender evaluates the graph again on every
slider drag. A later phase can evaluate a geometry-only subgraph in a browser
Web Worker while the creator drags and keep server runs for saving. The core's
purity (GN-D13) and determinism (GN-D15) exist to keep this possible.

**D12. Blender as an optional backend, later.** A
`nodetool.blender.GeometryNodes` node would apply a node group from a `.blend`
asset to a geometry input and expose the group's inputs as properties. It
covers nodes the TypeScript core lacks and works only where Blender is
installed.

## 8. First slice

| Group | Nodes |
|---|---|
| Primitives | Grid, Cube, UV Sphere, Cylinder, Line, Curve Circle, Points |
| Field inputs | Position, Normal, Index, ID, Named Attribute |
| Field operations | Math, Vector Math, Map Range, Compare, Random Value, Noise, Combine XYZ, Separate XYZ |
| Geometry operations | Set Position, Transform, Join, Instance on Points, Realize Instances, Distribute Points on Faces, Extrude Mesh, Delete Geometry, Store Named Attribute, Capture Attribute, Mesh Boolean, Curve to Mesh, Set Material |
| Bridge and inspection | `ToModel3D`, `FromModel3D`, Viewer |

Mesh Boolean runs on `manifold-3d` and shares the Manifold loader with
`Boolean3D` (F3).

## 9. Testing decisions

| Criterion | Test boundary | Prior art |
|---|---|---|
| Data model invariants, attribute sharing, no mutation of inputs | Unit tests in `packages/geometry` | `packages/model3d/tests/` |
| Field evaluation and domain interpolation give the documented arrays for small hand-built meshes | Unit tests in `packages/geometry` | `packages/model3d/tests/primitives.test.ts` |
| `.ntgeo` round trip is lossless for every attribute type and domain | Codec test in `packages/geometry` | MsgPack framing in `packages/protocol/src/bridge-frames.ts` |
| Connection rules of GN-D2 | `web/src/utils/__tests__/TypeHandler.test.ts`, `packages/node-sdk/tests/graph-validation.test.ts`, and a new test for `typesCompatible` in `packages/execution-core/tests/` | The `T` to `list[T]` cases |
| Each node of section 8 | Package tests in `packages/geometry-nodes`, and `nodetool node run` | `packages/video-nodes/tests/model3d-*.test.ts` |
| `ToModel3D` output passes `validateModel3D` and survives `FromModel3D` | Bridge test in `packages/geometry-nodes` | `packages/model3d/tests/validate.test.ts` |
| Determinism (GN-D15) | One test runs the evaluator in Node and compares with a checked-in array. A browser test compares the same array | `packages/kernels/tests/parity.test.ts` |
| `GeometryRef` crosses memory cache, temporary storage and the client in one ID form | Boundary test, as the resource ID principles require | Existing `model_3d` output tests |
| The four graphs of section 2 run | Example workflows checked by `validate:examples`, and one run in the [in-browser workflow harness](../../web/src/e2e_runner/README.md) with a screenshot | Existing example workflows |
| Element limit (GN-D16) | Node test that expects the error text | CF-D26 |
| Performance | A bench in `packages/geometry` at 100,000 and 1,000,000 points | `packages/kernels/bench/kernels.bench.ts` |

Each new check must fail on deliberately invalid input before it counts
([claims, checks and measurements](../../AGENTS.md#claims-checks-and-measurements)).

## 10. Milestones

- M1. Core. `packages/geometry` with the data model, the evaluator, domain
  interpolation and the codec. Exit: unit tests pass and GN-A1 has numbers.
- M2. Types. `GeometryRef`, `field`, the GN-D4 value types, the three
  checkers, the data type registry entries and the field handle shape. Exit:
  the GN-D2 connection tests pass in all three places.
- M3. Nodes. The first slice of section 8 with the bridge. Exit: the Scatter
  and Cut graphs run with `nodetool run`.
- M4. Preview. The `geometry` output case, the Viewer node and the attribute
  table. Exit: the Displace and Inspect graphs pass in the browser harness.
- M5. Release. A docs page, the four example workflows and the cloud
  allowlist entry.

Later, in this order unless GN-Q1 or GN-Q2 changes it: Repeat zone (GN-D7),
live preview (GN-D11), Blender backend (GN-D12), Simulation zone.

Measurements that gate decisions:

- A1. Bench the evaluator and the first-slice geometry operations at 100,000
  and 1,000,000 points. The result sets the GN-D16 limit and decides whether
  any loop moves to the kernels path.
- A2. Measure `.ntgeo` size, decode time and GPU upload time in the browser.
  The result sets the GN-D8 decimation threshold.
- A3. Load `manifold-3d` in a browser worker and in the native graph runner's
  guest. A failure restricts Mesh Boolean to hosts that pass.
- A4. Open a GLB with `EXT_mesh_gpu_instancing` in `LazyModel3DViewer`,
  `RenderToImage`, Blender `RenderImage` and the 3D Editor. The result sets
  the `ToModel3D` default (GN-D10).

## 11. Risks

- R1. Performance. The estimate that column-wise JavaScript handles a few
  hundred thousand points for each node has no measurement behind it.
  Distribute Points on Faces and Mesh Boolean are the likely hot spots. GN-A1
  measures it, and the fallback is the kernels path (F9).
- R2. Parity. Noise and Random Value output will not match Blender's numbers.
  The docs page must say so, or creators will report differences from Blender
  as defects.
- R3. Type system. The `field` generic and the value-to-field conversion
  change three connection checkers that every workflow uses (F7).
  `typesIncompatible` needs an explicit `field` case, because it skips generic
  types today. M2 lands before any node so that the change is reviewed alone.
- R4. Memory. Geometry values stay in the run context's cache for the length
  of a run. A long chain of large geometries holds them all. Attribute sharing
  (GN-D1) and the element limit (GN-D16) bound it, and GN-A1 must record peak
  memory.
- R5. Two boolean nodes. `Boolean3D` on `model_3d` and Mesh Boolean on
  `geometry` will both appear in the node menu. Their descriptions must state
  which type each takes.

## 12. Open questions

- Q1. Is live preview while dragging (GN-D11) required for the first release?
  This document assumes server runs are enough.
- Q2. Must NodeTool load Blender `.blend` node groups (GN-D12), or is
  Blender-like behavior enough? This document assumes the second.
- Q3. Do Volume and Grease Pencil components stay out of scope? This document
  assumes yes.
- Q4. Which outputs besides the Viewer node send a full geometry to the
  client? The server does not know which node is selected during a run, so a
  selected-node preview needs a request from the client after the run.
- Q5. Does the Code node get `@nodetool-ai/geometry` as a sandbox import in
  the first release? This document assumes no.

## 13. Out of scope

- Volume and Grease Pencil components (GN-Q3).
- The Simulation zone, For Each Element and frame stepping.
- Loading `.blend` files or Blender node groups (GN-D12).
- Number-for-number parity with Blender's noise, random and boolean output.
- A change to the 3D Editor, to `Transform3D` or to any other
  `nodetool.model3d.*` node.
- Shading nodes. `material` is a slot reference that `ToModel3D` maps to a
  glTF material.
