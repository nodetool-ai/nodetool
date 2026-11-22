# Geometry nodes: product requirements

This document specifies procedural geometry in NodeTool workflows: nodes that
build and change meshes, curves, point clouds and instances, with values that
vary per element. The model is Blender's Geometry Nodes. The implementation is
a C++ geometry library under `native/`. The nodes run in the
[native workflow editor](../../native/node-editor/README.md) through the
[C++ graph runner](../../native/graph-runner/README.md). They do not run on
the NodeTool server in the first release (GN-D17).

Cross-plan references use `GN-`, for example `GN-D2`. References to the
control-flow regions plan use `CF-`, for example `CF-D3`.

Citations are relative to the repository root at `f35f8555`. Statements about
Blender (`GeometrySet`, fields, anonymous attributes, zones) come from
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

Geometry nodes are an interactive tool. A creator changes a value and expects
the mesh to change. A run on a server adds a round trip and a file transfer to
every change. The native editor runs a graph inside its own process (F12),
which removes both.

## 2. Solution

Geometry nodes are workflow nodes in a `nodetool.geometry` namespace. A
`geometry` value flows between them. Field nodes (Position, Noise, Math)
describe a value per element and cost nothing until a geometry node evaluates
them. The geometry lives in C++ memory inside the graph runner, and the node
code holds a handle to it. `ToModel3D` and `FromModel3D` convert between a
geometry and the existing `model_3d` (glTF) type. The node's output card shows
the geometry in a viewport, and a Viewer node shows any field as colors and as
a table.

The first release must run each graph in this table as a local run in the
native editor, with no server connection and no Blender installed.

| Case | Graph | Result |
|---|---|---|
| Scatter | `Grid ▶ Distribute Points on Faces ▶ Instance on Points ◀ Cube`, with `Random Value` on Scale, then `Realize Instances` | The scattered cubes in the output viewport |
| Displace | `Grid ▶ Set Position`, with Offset from `Normal × Noise(Position)` | A displaced mesh in the output viewport |
| Cut | `Cube` and `UV Sphere` into `Mesh Boolean` (difference), then `ToModel3D ▶ SaveModel3D` | A GLB asset that opens in the 3D Editor |
| Inspect | Any geometry and a field into `Viewer` | The viewport colored by the field, and a table of the attribute values for each domain |

Goals:

- G1. A creator builds the four graphs above from the native editor's node
  menu.
- G2. The same graph and seed give the same geometry on every platform the
  native editor ships on.
- G3. `ToModel3D` output is a valid GLB that the existing `model_3d` nodes
  with a local run accept (F16).
- G4. An agent can run and inspect a geometry graph with the graph runner's
  command line and no window open
  ([Harness-First rules](../HARNESS_FIRST.md#the-rules)).

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
| Local run | A run inside the native editor's process on the graph runner |
| Capability | A named group of C++ functions that node code calls as `__host.<name>.<function>` |
| Handle | A number that node code holds in place of a geometry. The capability owns the geometry |

## 4. User stories

- U1. A creator adds a primitive (Grid, Cube, UV Sphere, Cylinder, Line, Curve
  Circle, Points) and sees it in the node's output viewport after a local run.
- U2. A creator connects Position, Noise and Math nodes into Set Position and
  the mesh moves per vertex. The field nodes show no geometry.
- U3. A creator connects a number to a field input and it applies to every
  element. A connection from a field output to a number input is refused in
  the native editor and in the web editor, and `nodetool validate` reports it
  with the edge and both types.
- U4. A creator scatters points on a mesh, instances a second geometry on
  them, and varies scale or rotation per instance with Random Value. The same
  seed gives the same result on every run and every platform.
- U5. A creator connects a geometry and a field to a Viewer node and reads the
  values in a table, one tab for each domain.
- U6. A creator converts a geometry with `ToModel3D` and saves it with
  `SaveModel3D`. A creator loads a GLB with `FromModel3D` and changes it with
  geometry nodes.
- U7. A creator who exceeds the element limit of a node gets an error that
  names the count and the limit before the process runs out of memory
  (GN-D16).
- U8. A creator who opens a geometry workflow in the web editor, or sends it
  to a server, sees each geometry node marked as available in the native
  editor only. The run does not start (GN-D14).
- U9. An agent runs a geometry graph with the
  [graph runner's command line](../../native/graph-runner/README.md#run) and
  reads element counts and bounds from each geometry output and attribute
  values from the Viewer node's table output.

## 5. Starting point

The 3D stack:

- F1. The 3D type is `model_3d`, a ref to a GLB or glTF file
  (`Model3DRef` in [`api-types.ts`](../../packages/protocol/src/api-types.ts)).
  [`@nodetool-ai/model3d`](../../packages/model3d/README.md) reads, edits and
  validates the glTF scene document and does no rendering.
- F2. The `nodetool.model3d.*` nodes live in
  [`packages/video-nodes/src/nodes/model3d/`](../../packages/video-nodes/src/nodes/model3d/).
  None of them exposes a per-element value.
- F3. `Boolean3D` runs on `manifold-3d`, the WebAssembly build of the Manifold
  C++ library
  ([`boolean-ops.ts`](../../packages/video-nodes/src/nodes/model3d/boolean-ops.ts)).
- F4. No vector type exists. `Transform3D` declares nine `float` properties
  ([`transforms.ts`](../../packages/video-nodes/src/nodes/model3d/transforms.ts)).
  The data type registry in
  [`data_types.ts`](../../web/src/config/data_types.ts) has no entry for a
  vector, a quaternion, a matrix or a material.
- F7. Four places decide whether two types connect: `isConnectable` in
  [`TypeHandler.ts`](../../web/src/utils/TypeHandler.ts) for the web editor,
  `connectionTypesCompatible` in
  [`ConnectionTypes.h`](../../native/node-editor/src/document/ConnectionTypes.h)
  for the native editor, `typesIncompatible` in
  [`type-compat.ts`](../../packages/node-sdk/src/type-compat.ts) for
  `nodetool validate`, and `typesCompatible` in
  [`graph-utils.ts`](../../packages/execution-core/src/graph-utils.ts) for
  bypass routing. The native function mirrors the web one, and both let `T`
  connect to `list[T]`. `typesIncompatible` skips every type that has type
  arguments, so it would accept `field[float]` into `float` today.
- F8. The realtime compiler carries deferred values as a serializable
  expression tree, `{ kind: "operation", op, inputs }`
  (`ControlExpression` in
  [`Types.ts`](../../packages/realtime-compiler/src/Types.ts)).
- F10. The cloud profile allowlists namespaces. `nodetool.model3d` is on the
  list and `nodetool.blender` is not
  ([`cloud-profile.ts`](../../packages/protocol/src/cloud-profile.ts)).
- F11. The For Each Region with State for next item is specified in
  [control-flow regions](control-flow-regions.md) (CF-D3, CF-D18). A search of
  `packages/*/src` for `ForEachRegion` and `for_each_region`, and of
  `native/graph-runner/src/kernel/` for `region`, finds no implementation.

The native stack:

- F12. The native editor runs a graph inside its own process when the graph
  runner supports every node in it. Every other graph goes to the server
  ([Local runs](../../native/node-editor/README.md#local-runs)). No run is
  split between the two.
- F13. In the graph runner the kernel is C++ and the node bodies are the
  existing TypeScript node classes, run in an embedded QuickJS-ng engine.
  QuickJS interprets bytecode and has no JIT compiler.
- F14. Node code reaches C++ through capabilities
  ([Host capabilities](../../native/graph-runner/README.md#host-capabilities),
  [`capabilities.h`](../../native/graph-runner/src/host/capabilities.h)). A
  capability can rewrite an outgoing message that holds values only the host
  can read (`boundary`) and free what a run held (`endRun`). The `gpu`
  capability uses both for texture handles.
- F15. The [native kernel library](../../native/kernels/README.md) holds the
  sample and pixel loops of the audio and image nodes in C++. The node classes
  stay in TypeScript and keep their type, properties and validation. The same
  sources build as a static library for the graph runner and as a WebAssembly
  module for the server and the browser. No kernel function allocates memory
  that outlives the call.
- F16. A node runs locally when the parity suite shows it matches the server,
  or when it is on a list of types qualified by their own tests
  ([`local-nodes.mjs`](../../native/graph-runner/guest/local-nodes.mjs)). In
  [`baseline.json`](../../native/graph-runner/parity/baseline.json),
  `Transform3D`, `MergeMeshes`, `FormatConverter`, `SaveModel3D` and the mesh
  cleanup nodes are at parity. `RenderToImage` and `Boolean3D` are recorded as
  mismatches. Every `nodetool.blender.*` node is skipped because it starts a
  host program.
- F17. The native output card renders `dataframe` and does not render
  `model_3d`
  ([preview parity](../../native/node-editor/docs/preview-node-parity.md)).
  The editor's `find_package(Qt6 ...)` line in
  [`CMakeLists.txt`](../../native/node-editor/CMakeLists.txt) lists no 3D
  module.
- F18. [`gpu-preview`](../../native/gpu-preview/README.md) shows a texture of
  the graph runner's wgpu-native device in a Qt Quick item without reading
  pixels back. It runs on Linux with Vulkan and on macOS with Metal. Windows
  is not implemented.
- F19. Every project under `native/` follows the
  [native rules](../../native/AGENTS.md): single ownership expressed in the
  type, declared thread affinity, and clean AddressSanitizer,
  UndefinedBehaviorSanitizer and ThreadSanitizer builds.

## 6. Options

- O1. Run Blender for every evaluation. It matches Blender exactly. Each run
  starts a process, a Blender install is required, and the graph runner skips
  every node that starts a host program (F16). A slider drag cannot show a
  result.
- O2. Port Blender's C++. The license allows it: GPL-2.0-or-later code can be
  used under GPLv3, which combines with AGPLv3. The node code depends on
  Blender's internal libraries and its threading, so a port is a rewrite. With
  a C++ core the rewrite can follow Blender's structure closely.
- O3. Reimplement the data model and the field semantics in TypeScript. It
  would run on the server, in a browser worker and in the sandbox. In the
  graph runner the same code runs in an interpreter (F13), which is the reason
  the audio and image loops moved to the kernel library (F15).
- O4. Reimplement the data model and the field semantics as a C++ library
  under `native/`, reached through a graph runner capability. The node classes
  stay in TypeScript, as the kernel nodes do (F15).

**Decision: O4.** The library follows the kernel library's portability rules
(GN-D13), so a WebAssembly build for the server stays possible (GN-Q1).

## 7. Decisions

### Scope

**D17. Native editor only in the first release.** Geometry nodes run as local
runs on the graph runner. They do not run on the NodeTool server, in the web
editor, in the Electron app or on a cloud deployment.

Because no run is split between the runner and the server (F12), a graph with
a geometry node runs only when every other node in it also runs locally. The
graph of GN-G3 can therefore end in `SaveModel3D` and cannot end in
`RenderToImage` or a Blender node (F16). This is the main cost of this
decision. GN-Q6 asks how a creator gets a rendered image.

**D14. Outside the graph runner the nodes do not run.** `nodetool.geometry`
stays off the cloud allowlist (F10). On a server, a geometry node fails its
preflight with an error that names the native editor, as a Blender node fails
without Blender. The web editor shows the node as available in the native
editor only.

### Types

**D1. A `geometry` value modelled on Blender's `GeometrySet`.** It holds at
most one component of each kind. All data lives in columnar arrays. This
sketch states the layout and is not the final interface.

```cpp
enum class Domain { Point, Edge, Face, Corner, Curve, Instance };
enum class AttrType { Float, Int, Bool, Int8, Float2, Float3, Color, Quaternion, Float4x4 };

struct Attribute {
  Domain domain;
  AttrType type;
  std::shared_ptr<const AttributeData> data;   // immutable, shared between geometries
};

struct Mesh {
  int pointCount;
  SharedArray<int> edgeVerts;     // 2 per edge
  SharedArray<int> faceOffsets;   // CSR into corners
  SharedArray<int> cornerVerts;
  AttributeMap attributes;        // "position" is Point / Float3
  std::vector<MaterialSlot> materials;
};
struct Curves     { SharedArray<int> curveOffsets; AttributeMap attributes; };  // position, radius, tilt, cyclic
struct PointCloud { AttributeMap attributes; };                                 // position, radius
struct Instances  { SharedArray<float> transforms; SharedArray<int> refIndex;
                    std::vector<std::shared_ptr<const Geometry>> refs; AttributeMap attributes; };

struct Geometry { std::optional<Mesh> mesh; std::optional<Curves> curves;
                  std::optional<PointCloud> points; std::optional<Instances> instances; };
```

An attribute array is immutable once a node has published it. Several
geometries refer to one array, and a node that changes an attribute writes a
new array. Without this rule every node copies the whole mesh. The arrays use
shared ownership because no single geometry outlives the others that refer to
the same array, which is the justification native rule 1 asks for (F19).

**D2. A `field` value carried as a serializable expression tree.**

```ts
type Field =
  | { kind: "const"; type: AttrType; value: unknown }
  | { kind: "input"; name: "position" | "normal" | "index" | "id" }
  | { kind: "attr"; name: string; type: AttrType }
  | { kind: "anon"; id: string; type: AttrType }   // e.g. Extrude Mesh "Top"
  | { kind: "op"; op: string; args: Field[]; params?: Record<string, unknown> };
```

Field nodes are plain TypeScript and only build this tree. They call no
capability. A geometry node passes the tree to the capability as JSON, and the
C++ evaluator computes it over arrays, one operation for each column. When an
attribute's domain differs from the evaluation domain, the evaluator
interpolates between them as Blender does, for example by averaging point
values onto a face.

In type metadata a field is `field` with one type argument, for example
`field[float]`. The connection rules are:

- A `T` output connects to a `field[T]` input and acts as a constant field.
- A `field[T]` output never connects to a `T` input.
- A field input left unconnected uses its implicit field. Set Position's
  Position input defaults to the Position field.

The first release narrows Blender's dynamic socket shape. An output of a
`nodetool.geometry` field node is always `field[T]`, and scalar arithmetic
stays on the existing math nodes. An output whose type depends on its
connections would need type inference in all four checkers (F7).

The rules land in all four checkers, because the workflow format is shared and
the web editor can edit a geometry workflow that it cannot run. The native
editor draws field handles with a different shape from value handles.

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

**D5. `GeometryRef` and handles.** Add
`{ type: "geometry"; uri; asset_id?; temp_id?; handle?; summary? }` to
[`api-types.ts`](../../packages/protocol/src/api-types.ts). The summary holds
the element counts for each component and the bounds. Inside a run the ref
carries a handle and the capability owns the geometry. Node code never holds
the arrays. The capability frees every geometry of a job in `endRun`. When a
ref leaves the runner in a message, the capability's `boundary` rewrite drops
the handle and keeps the summary (F14). A geometry is serialized only when a
node saves it or the Viewer sends it. The file format is `.ntgeo`, a columnar
MsgPack format, because glTF cannot hold edges, curves or attributes on
arbitrary domains without loss. A saved ref follows the
[resource ID principles](../../AGENTS.md#resource-id-principles).

### Execution

**D6. Each geometry node is a TypeScript node class that calls the `geometry`
capability.** The class declares the type, the properties and the validation.
The capability does the work on handles and returns a new handle with its
summary. This is the kernel pattern (F15) with host-owned state added.

**D13. Three parts.**

- `native/geometry` is the C++ library: the data model, the field evaluator,
  domain interpolation, the geometry operations and the `.ntgeo` codec. It
  depends on the C++20 standard library and on Manifold. It includes no Qt
  header and no QuickJS header. It compiles with `-ffp-contract=off` and
  without fast math, as the kernel library does.
- The `geometry` capability lives in `native/graph-runner/src/host/` with its
  guest half in `native/graph-runner/guest/host/`. It owns the geometry store
  of each job.
- `packages/geometry-nodes` holds the node classes and follows the
  [package dependency order](../../packages/AGENTS.md#package-dependency-order).

The library is separate from the kernel library because a geometry outlives
the call that made it, which the kernel library forbids (F15).

**D18. Local admission.** The geometry node types join the list of types that
[`local-nodes.mjs`](../../native/graph-runner/guest/local-nodes.mjs) admits on
the strength of their own tests. They have no server implementation to compare
with, so the parity suite cannot admit them (F16).

**D19. Ownership and threads.** The geometry store is owned by the capability
and touched on the runner's worker thread. Each geometry in it has one owner,
the store. An operation that leaves the worker thread follows the runner's
[native jobs and lanes](../../native/graph-runner/README.md#native-jobs-and-lanes)
rules. GN-A1 decides which operations do. The summary of each change states
owner, thread and destruction for every new object, as native rule 16
requires.

**D15. Determinism.** Random Value and Noise take a seed and use integer
hashing. One implementation and the compiler flags of GN-D13 give byte-equal
attribute arrays on every platform.

**D16. Element limit.** A node that would produce more elements than the limit
fails before it allocates, with an error that names the count and the limit.
The limit sits beside the runner's
[admission limits](../../native/graph-runner/README.md#admission-limits).
GN-A1 sets the default.

**D7. Zones.** The Repeat zone maps to the For Each Region with State for next
item (CF-D3, CF-D18). It ships after the graph runner's kernel runs that
region (F11). The Simulation zone and For Each Element are later work.

### Rendering and inspection

**D8. A viewport in the native output card.** The card of a geometry output
shows an orbit viewport.

- A mesh with face or corner attributes splits vertices by corner.
- A point cloud draws points sized from radius.
- Curves draw as line segments.
- Instances draw with GPU instancing.

Two implementations are possible, and GN-A2 chooses between them:

| | Qt Quick 3D | wgpu-native through `gpu-preview` |
|---|---|---|
| Fit | A geometry item built from the attribute arrays, with the module's camera, picking and instancing | A render pass on the runner's device, shown by the existing item (F18) |
| New dependency | The Qt Quick 3D module (F17) | None |
| Platforms | Those Qt Quick 3D supports | Linux and macOS. Windows is not implemented (F18) |
| To write | The geometry item and the editor integration | The renderer, the camera and picking |

A preview above the size threshold is decimated and labelled as decimated.
GN-A2 sets the threshold. The same viewport gives the native editor its first
`model_3d` preview when the item is fed from a GLB (F17), which is outside the
first release.

**D9. A Viewer node and an attribute table.** The Viewer node takes a geometry
and an optional field. It colors the viewport by the field's values and
outputs a table for each domain as a `dataframe`, which the native card
already renders (F17). An agent reads the same output (GN-G4).

**D10. The bridge.** `ToModel3D` writes GLB in the capability: meshes as
primitives, custom attributes as `_NAME`, and curves as line primitives or
tube meshes. Its `instancing` option is `realize` or `gpu_instancing`
(`EXT_mesh_gpu_instancing`). The default is `realize` until GN-A4 shows that
every consumer reads the extension. `FromModel3D` reads GLB into a geometry.
`ToModel3D` output must pass `validateModel3D`.

**D11. Live update.** A local run has no round trip, so the editor can run the
graph again while the creator drags a value. GN-A5 measures a second run of
the Displace graph. GN-Q1 asks whether live update is in the first release.

**D12. Blender as a backend, deferred.** A node that applies a `.blend` node
group starts a host program, which the graph runner skips (F16). It cannot
share a run with geometry nodes until GN-D17 changes.

## 8. First slice

| Group | Nodes |
|---|---|
| Primitives | Grid, Cube, UV Sphere, Cylinder, Line, Curve Circle, Points |
| Field inputs | Position, Normal, Index, ID, Named Attribute |
| Field operations | Math, Vector Math, Map Range, Compare, Random Value, Noise, Combine XYZ, Separate XYZ |
| Geometry operations | Set Position, Transform, Join, Instance on Points, Realize Instances, Distribute Points on Faces, Extrude Mesh, Delete Geometry, Store Named Attribute, Capture Attribute, Mesh Boolean, Curve to Mesh, Set Material |
| Bridge and inspection | `ToModel3D`, `FromModel3D`, Viewer |

Mesh Boolean links the Manifold C++ library. It does not depend on the
`manifold-3d` WebAssembly module, whose `Boolean3D` node is a recorded
mismatch in the runner (F16).

## 9. Testing decisions

| Criterion | Test boundary | Prior art |
|---|---|---|
| Data model invariants, attribute sharing, no mutation of a published array | ctest in `native/geometry`, under all three sanitizers | [`kernels_tests.cpp`](../../native/kernels/tests/kernels_tests.cpp) |
| Field evaluation and domain interpolation give the documented arrays for small hand-built meshes | ctest in `native/geometry` | The same |
| `.ntgeo` round trip is lossless for every attribute type and domain | Codec ctest in `native/geometry` | The same |
| The capability frees every geometry of a job at `endRun`, and `boundary` drops handles | Graph runner ctest | `gr_gpu_tests` |
| Each node of section 8 | Graph fixtures in `native/graph-runner/tests/graphs/` with expected summaries and array hashes | `gr_audio_render_tests` |
| Connection rules of GN-D2 | `web/src/utils/__tests__/TypeHandler.test.ts`, `packages/node-sdk/tests/graph-validation.test.ts`, a new test for `typesCompatible`, and a new native editor test for `connectionTypesCompatible` | The `T` to `list[T]` cases |
| `ToModel3D` output passes `validateModel3D` and survives `FromModel3D` | Graph runner fixture that feeds the GLB to `@nodetool-ai/model3d` | `packages/model3d/tests/validate.test.ts` |
| Determinism (GN-D15) | Array hashes checked in once and compared on every CI platform | The PCM hashes of the audio render tests |
| The four graphs of section 2 run locally | The editor's local run tests | `native/node-editor/tests/server/LocalRunTests.cpp` |
| Geometry nodes outside the runner fail with the GN-D14 error | Package test in `packages/geometry-nodes` | `packages/blender-nodes/tests/` |
| Element limit (GN-D16) | Fixture that expects the error text | CF-D26 |
| Performance | A bench in `native/geometry` at 100,000 and 1,000,000 points | `native/kernels/bench` |

`npm run test:affected:native` selects the ctest tests for a change under
`native/`. Each new check must fail on deliberately invalid input before it
counts
([claims, checks and measurements](../../AGENTS.md#claims-checks-and-measurements)).

## 10. Milestones

- M1. Library. `native/geometry` with the data model, the evaluator, domain
  interpolation and the codec. Exit: ctest passes under the three sanitizers
  and GN-A1 has numbers.
- M2. Types. `GeometryRef`, `field`, the GN-D4 value types, the four checkers,
  the data type registry entries and the native field handle shape. Exit: the
  GN-D2 connection tests pass in all four places.
- M3. Nodes. The `geometry` capability, the first slice of section 8, the
  bridge and local admission (GN-D18). Exit: the Scatter and Cut graphs run
  with the graph runner's command line.
- M4. Viewport. The output card viewport, the Viewer node and the attribute
  table. Exit: the Displace and Inspect graphs pass in the editor's local run
  tests.
- M5. Release. A docs page, the four example workflows and the GN-D14 state
  in the web editor.

Later, in this order unless a question below changes it: live update
(GN-D11), a `model_3d` preview in the native card, the Repeat zone (GN-D7),
a WebAssembly build for the server (GN-Q1).

Measurements that gate decisions:

- A1. Bench the evaluator and the first-slice geometry operations at 100,000
  and 1,000,000 points, with peak memory. The result sets the GN-D16 limit and
  decides which operations leave the worker thread (GN-D19).
- A2. Build both viewport candidates of GN-D8 far enough to show a 1,000,000
  triangle mesh in the editor's canvas, and record frame time and the
  platforms each one runs on. The result chooses the implementation and sets
  the decimation threshold. The spike also confirms the license terms of the
  Qt Quick 3D module against those of the native apps.
- A3. Build Manifold from source in the graph runner's CMake, pinned by
  SHA-256 as its other fetched dependencies are, on every platform the editor
  ships on.
- A4. Open a GLB with `EXT_mesh_gpu_instancing` in the 3D Editor and in each
  `model_3d` node that runs locally. The result sets the `ToModel3D` default
  (GN-D10).
- A5. Time a second local run of the Displace graph at 100,000 points after
  one property change. The result decides whether live update (GN-D11) needs
  result caching in the runner.

## 11. Risks

- R1. Performance. The C++ core removes the interpreter from the loops, and no
  measurement exists yet. Distribute Points on Faces and Mesh Boolean are the
  likely hot spots. GN-A1 measures them.
- R2. Parity. Noise and Random Value output will not match Blender's numbers.
  The docs page must say so, or creators will report differences from Blender
  as defects.
- R3. Type system. The `field` generic and the value-to-field conversion
  change four connection checkers that every workflow uses (F7).
  `typesIncompatible` needs an explicit `field` case, because it skips generic
  types today. M2 lands before any node so that the change is reviewed alone.
- R4. Memory. Geometries stay in the capability's store until the run ends. A
  long chain of large geometries holds them all. Attribute sharing (GN-D1) and
  the element limit (GN-D16) bound it, and GN-A1 records peak memory.
- R5. Two boolean nodes. `Boolean3D` on `model_3d` and Mesh Boolean on
  `geometry` will both appear in the node menu. Their descriptions must state
  which type each takes.
- R6. Reach. The feature exists only for creators who use the native editor. A
  geometry workflow opened in the web editor cannot run (GN-D14), and a
  geometry graph cannot include a node that runs only on the server (GN-D17).
- R7. Maturity of the host. The graph runner's README describes it as a
  prototype phase, and `gpu-preview` has not run on a physical Mac or on
  Windows (F18). The feature inherits both.
- R8. Lifetime errors. A handle that outlives its geometry, or a geometry
  freed while an operation reads it, is a memory error in C++ where it would
  be an exception in TypeScript. The sanitizer builds (F19) and the `endRun`
  test are the controls.

## 12. Open questions

- Q1. Is native-only the permanent boundary or the scope of the first release?
  This document assumes the second and keeps the library portable (GN-D13), so
  the kernel library's WebAssembly path (F15) could bring the nodes to the
  server later. That build would also lift the GN-D17 restriction on mixed
  graphs.
- Q2. Must NodeTool load Blender `.blend` node groups (GN-D12), or is
  Blender-like behavior enough? This document assumes the second.
- Q3. Do Volume and Grease Pencil components stay out of scope? This document
  assumes yes.
- Q4. Is live update while dragging (GN-D11) in the first release? This
  document assumes no and measures it with GN-A5.
- Q5. Does the Code node get a geometry import in the sandbox? This document
  assumes no.
- Q6. How does a creator get a rendered image of a geometry in the first
  release? `RenderToImage` and the Blender nodes do not run locally (F16). The
  candidates are a snapshot of the GN-D8 viewport, a port of `RenderToImage`
  to the runner's wgpu-native device, or no image output. This document
  assumes no image output.
- Q7. Does the web editor need more than the GN-D14 unavailable state, for
  example a read-only preview of a saved `.ntgeo` asset? This document assumes
  no.

## 13. Out of scope

- Running geometry nodes on the server, in the web editor, in the Electron app
  or on a cloud deployment (GN-D17).
- A run split between the graph runner and the server.
- Volume and Grease Pencil components (GN-Q3).
- The Simulation zone, For Each Element and frame stepping.
- Loading `.blend` files or Blender node groups (GN-D12).
- Number-for-number parity with Blender's noise, random and boolean output.
- A change to the 3D Editor, to `Transform3D` or to any other
  `nodetool.model3d.*` node.
- Shading nodes. `material` is a slot reference that `ToModel3D` maps to a
  glTF material.
