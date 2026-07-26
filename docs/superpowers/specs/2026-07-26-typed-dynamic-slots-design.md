# Typed dynamic slots

**Status:** Proposed
**Date:** 2026-07-26

Turn the untyped `dynamic_properties` bag on dynamic nodes into typed slots:
each user-added input carries a declared `TypeMetadata`, the UI lets the user
pick and edit that type, the static validator rejects mis-typed edges into
dynamic slots, and the kernel runner checks (and where safe, coerces) values
at execution time.

## Current state

Three parallel structures exist today, only one of which is typed end-to-end:

| Field | Shape | Where it lives | Typed? |
|---|---|---|---|
| `dynamic_properties` | `Record<string, unknown>` — name → **value** | protocol `Node`, web `NodeData`, kernel, DB | No |
| `dynamic_inputs` | `Record<string, TypeMetadata & {description?, min?, max?, default?}>` | web `NodeData` only (populated by FAL/Kie/Replicate/Comfy schema resolvers and the image-editor layer handles); **not** on the protocol `Node` | Yes, but not user-editable and not sent to the runner |
| `dynamic_outputs` | `Record<string, TypeMetadata>` | protocol `Node`, web, kernel | Yes |

Consequences of the gap:

- **UI**: `useDynamicProperty.handleAddProperty` creates a slot as `name: ""`
  with no type. `NodeInputs` resolves the handle type from `dynamic_inputs`
  when a schema resolver provided one, else falls back to the node's
  `dynamicInputFallbackType` or `any`. There is no way for a user to say "this
  slot is an `image`".
- **Validation**: `validateGraph` (`packages/node-sdk/src/graph-validation.ts`)
  skips the unknown-handle *and* the type-compatibility check for any edge
  whose target has `supports_dynamic_inputs` — every edge into a dynamic node
  passes, whatever its type.
- **Runner**: `kernel/graph.ts` merges `dynamic_properties` into `properties`;
  `actor.ts` applies precedence declared < dynamic < edge inputs. Values are
  never checked or coerced — a `str` wired into a slot a node treats as
  `list[image]` fails deep inside `process()` with a confusing error.
- **SDK**: `BaseNode.dynamicProps` is `Map<string, unknown>`; `setDynamic` /
  `getDynamic` are untyped and `validateProperties` ignores dynamic props.
- **Connect-time auto-add**: `graphMapping.ts` and `NodeStore` create a
  `dynamic_properties` entry (`""`) for an unknown edge handle, discarding the
  source output's type.

## Design

### Principle: types and values stay in separate maps

We do **not** change the shape of `dynamic_properties` (name → value). Changing
it to `name → {type, value}` would break every persisted workflow, all 40+
shipped example JSONs, the app-preview bundles, msgpack payloads, and the
Python worker wire format in one shot.

Instead, promote the already-existing `dynamic_inputs` map to the canonical,
persisted, per-instance **slot declaration**, and keep `dynamic_properties` as
the **value store**. A typed slot is the pair:

```
dynamic_inputs[name]     → DynamicSlotMeta   (type, description, default, required)
dynamic_properties[name] → unknown           (current inline value, as today)
```

```ts
/** packages/protocol/src/graph.ts */
export interface DynamicSlotMeta {
  type: TypeMetadata;
  description?: string;
  default?: unknown;
  required?: boolean;
}

export interface Node {
  // existing…
  dynamic_properties?: Record<string, unknown>;
  /** Typed slot declarations for dynamic inputs. Key set ⊇ keys of
   *  dynamic_properties that arrive via handles. A property without a
   *  declaration is an untyped legacy slot (treated as `any`). */
  dynamic_inputs?: Record<string, DynamicSlotMeta>;
  dynamic_outputs?: Record<string, TypeMetadata>;
}
```

**Back-compat falls out for free**: a workflow saved before this change has
`dynamic_properties` and no `dynamic_inputs`; every slot resolves to `any` and
behaves exactly as today. No data migration, no schema version bump.

### Type semantics

- A slot with no declaration is `any`: connects to everything, never coerced,
  never an error. (Legacy behavior, and the escape hatch.)
- Edge into a typed slot: source output type must be assignable to the slot
  type under the same rules used for static properties (`typeMetaToString` /
  union handling in `graph-validation.ts`). Violation = `error` in
  `validateGraph`, connection refused in the editor.
- Inline value in a typed slot: checked by the same machinery as declared
  `@prop` values (`coerceToDeclaredType` + `validateNodeProperties`),
  `warning` severity in static validation (values are often placeholders),
  hard check at runtime.
- Nodes may constrain what types users can pick:
  `static allowedDynamicSlotTypes?: TypeMetadata[]` on `BaseNode` (surfaced in
  `NodeMetadata` as `allowed_dynamic_slot_types`). Unset = full type palette.
  The existing per-class `dynamicInputFallbackType` (web) becomes the default
  type for newly created slots on that node class.

## Implementation plan

Ordered by package dependency (`protocol → node-sdk → kernel → websocket → web`);
each phase lands independently and keeps `npm run check` green.

### Phase 1 — Protocol + SDK model

`packages/protocol`:
- Add `DynamicSlotMeta` and `Node.dynamic_inputs` (above). Extend the graph
  round-trip tests.
- Mirror in `api-types.ts` where node schemas travel over REST, and add
  `allowed_dynamic_slot_types?: TypeMetadata[]` to `NodeMetadata`.

`packages/node-sdk`:
- `BaseNode`:
  - keep `dynamicProps` (values); add `dynamicSlotMeta: Map<string, DynamicSlotMeta>`
    populated from the graph node in `assign()` (the registry already injects
    `_dynamic_outputs`; inject `_dynamic_inputs` the same way).
  - `setDynamic(key, value)` coerces via `coerceToDeclaredType` when the slot
    has a declared type; `getDynamicSlots(): ReadonlyMap<string, DynamicSlotMeta>`
    for node authors.
  - `validateProperties` / `validate()` gain a pass over dynamic values:
    missing `required` slots and type-mismatched inline values become
    `NodePropertyValidationIssue`s.
  - new statics: `allowedDynamicSlotTypes`, and thread through to
    `node-metadata.ts` / `registry.ts` metadata emission.
- `graph-validation.ts` (`validateGraph`):
  - when the target supports dynamic inputs, look up
    `targetNode.dynamic_inputs?.[handle]`. Declared slot → run the normal
    type-compatibility check (mis-typed edge = `error`). Undeclared → keep
    today's permissive path, but emit an `info`/`warning`
    (`untyped_dynamic_slot`) so `--warnings-as-errors` users can ratchet.
  - validate inline `dynamic_properties` values against declared slots
    (`warning`).

### Phase 2 — Kernel runner enforcement

`packages/kernel`:
- `graph.ts`: carry `dynamic_inputs` through graph parsing (it already carries
  `dynamic_properties` / `dynamic_outputs`); include declared slots in the
  handle map used for edge resolution and bypass typing (`graph-utils.ts`
  currently types dynamic handles as `any` — use the slot type when present).
- `actor.ts`: at the property-merge points (`~L435`, `~L1064`), after merging
  declared < dynamic < edge inputs, validate edge-delivered values for typed
  slots: attempt `coerceToDeclaredType`; on hard mismatch raise a node error
  that names the slot, expected type, and received type — same UX as a missing
  required property today. Untyped slots keep the pass-through path.
- Pre-run check in `runner.ts`: reuse `validateGraph` output severity `error`
  for typed-slot edge mismatches (already wired for static types) so failures
  surface before execution, not mid-run.

### Phase 3 — Web editor UI

- `NodeData.dynamic_inputs` widens from the schema-resolver shape to
  `Record<string, DynamicSlotMeta>` (the current shape is structurally
  compatible: `TypeMetadata & {description?, …}` maps onto `{type, …}` — do
  this as an explicit normalization in `useMetadata`/schema resolvers rather
  than a silent cast, since FAL/Kie resolvers currently spread TypeMetadata at
  the top level).
- `useDynamicProperty`:
  - `handleAddProperty(name, type?)` writes both maps: value default from the
    slot type (`""` for str, `0` for int, `null` for refs) into
    `dynamic_properties`, and the `DynamicSlotMeta` into `dynamic_inputs`.
  - rename/delete keep the two maps in sync.
  - new `handleUpdatePropertyType(name, type)`.
- **Type editing UI**: a type picker on the dynamic-property row (in
  `PropertyContextMenu` for the compact path, and a small type chip/dropdown
  next to the rename affordance in `NodeInputs`). Palette = primitive types +
  asset refs + `list[T]`/union of those; filtered by
  `allowed_dynamic_slot_types` when the class declares it. Reuse the type
  labels/colors from the existing handle-type system (`handleUtils`,
  datatype colors) so slots look like every other typed handle.
- **Editor component selection**: `NodeInputs` already synthesizes a
  `Property` per dynamic slot; with a declared type it picks the same
  `PropertyInput` component a static property of that type gets (number
  editor, image drop, model select…). Untyped slots keep the string editor.
- **Connect-time inference**: when an edge is dropped on a dynamic node
  (`useConnectionHandlers`, `NodeStore` auto-add, `graphMapping.ts` repair
  pass), create the slot **with the source output's type** instead of `""`
  untyped. This makes most slots typed with zero user effort.
- **Connection validation**: the editor-side edge gating (ConnectionStore /
  `isConnectable` path in `handleUtils`) refuses incompatible drops on typed
  slots, same as static handles; untyped slots stay promiscuous.
- `graphMapping.ts`: serialize `dynamic_inputs` onto the runner-shape node so
  the kernel and `validateGraph` see it (today it never leaves `NodeData`).

### Phase 4 — Surrounding surfaces

- **Python bridge / worker**: the stdio worker already ships `is_dynamic`;
  pass `dynamic_inputs` through `PythonStdioBridge` payloads untouched (Python
  nodes ignore unknown fields today — verify, don't assume).
- **Agents/tools** (`packages/agents`): `add_edge` / `ui_add_node` tool
  validation currently mirrors the permissive dynamic rule; teach the graph
  tools to (a) declare a typed slot when adding an edge into a dynamic node
  and (b) respect slot types in `validate_workflow`. Update GraphPlanner
  prompt docs that describe dynamic inputs.
- **CLI**: `nodetool validate` picks the new checks up from `validateGraph`
  for free; add the `untyped_dynamic_slot` warning to its report legend.
- **Examples/templates**: regenerate nothing — legacy untyped slots stay
  valid. Opportunistically add slot types to a handful of flagship examples
  (Prompt Template, Data Generator) once the editor writes them.

### Phase 5 — Tests

- protocol: `DynamicSlotMeta` round-trip (JSON + msgpack).
- node-sdk: `assign`/`setDynamic` coercion, `validateProperties` with
  required/mistyped dynamic values, `validateGraph` matrix — typed-match,
  typed-mismatch (error), undeclared (warning), `any` slot, union types,
  `allowed_dynamic_slot_types` filtering.
- kernel: actor-level edge-value mismatch produces a node error naming the
  slot; typed slot coercion (int → float, scalar → list[T]); legacy graph with
  no `dynamic_inputs` runs byte-identical to today (regression suite in
  `bug-regressions.test.ts`).
- web: `useDynamicProperty` dual-map sync, type picker rendering, editor
  component selection per type, connect-time type inference, refusal of
  incompatible drops, `graphMapping` serializing `dynamic_inputs`
  (extend `graphMapping.test.ts`, `handleUtils.test.ts`,
  `connectionValidation.integration.test.ts`).
- e2e: one editor flow — add slot, set type to `image`, connect a `str`
  output (refused), connect an `image` output (accepted), run.

## Risks and open questions

- **Schema-resolver collision**: FAL/Kie/Replicate/Comfy resolvers overwrite
  `dynamic_inputs` wholesale when a model schema loads. User-declared slots on
  those node classes must either be preserved under a merge (schema keys win
  for schema-declared names, user keys survive otherwise) or type editing is
  disabled on schema-driven nodes (`endpoint_id`/`model_id` present). Start
  with the latter — schema-driven nodes already have correct types.
- **Rename atomicity**: rename must update `dynamic_properties`,
  `dynamic_inputs`, and connected edge handles in one store transaction, or
  undo/redo can strand a type under a dead name.
- **Union ergonomics**: the type picker should stay simple (single type +
  `list[T]`); full union editing is out of scope for v1 — `any` covers it.
- **Strictness rollout**: runner-side hard errors ship behind the same
  severity gate as static types. If field reports show legacy workflows
  breaking on coercion edge cases, demote the runtime check to a warning for
  one release (flag: `NODETOOL_STRICT_DYNAMIC_SLOTS=0`) — decide during
  Phase 2 review whether the flag is warranted at all.

## Rough sequencing

Phases 1–2 are one PR each (protocol+SDK, then kernel), independently
shippable and inert without the UI. Phase 3 is the largest and can split into
(a) dual-map plumbing + connect-time inference and (b) the type-picker UI.
Phases 4–5 ride along with 2–3. Decorator packages (`node-sdk`, `base-nodes`)
change, so each PR needs `npm run build:packages` before dev verification.
