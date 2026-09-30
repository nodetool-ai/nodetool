# Retained game authoring work plan

Extend native game construction with retained authoring and safe rebuilds. Keep
preparation, construction and simulation separate. The delivery proof is the
second and third edit of a generated game, including preserved property edits
and deleted-instance suppression.

## Scope and decisions

- D1. A versioned authoring model is the saved authority for generated content.
  Native runtime documents are validated build outputs. Retained source belongs
  to explicit procedural units. Source and semantic data cannot become competing
  authorities.
- D2. Ship stable authored identity from the first construction milestone.
  Separate definition, authored-instance and runtime-instance identity. Display
  names and insertion order cannot determine identity. Keep project resource IDs
  consistent with repository ID rules.
- D3. Preview creates a candidate without changing drafts or sessions. Apply
  checks the exact base revision and source/dependency digests atomically.
- D4. Initial procedural units have explicit inputs, literal preparation results
  and pinned asset bindings. Rebakes have no external capabilities. Automatic
  timeline-style capture is optional follow-up work.
- D5. Property overrides and deletion suppression are required for the delivery
  proof. Conservative entity conflicts are an intermediate milestone only.
- D6. Retained-project sessions pin definitions and asset dependencies. Adopt
  rebuilds on restart. General live state migration is deferred.

The contract milestone must choose metadata placement in the existing saved
document versus a versioned envelope, and document its compatibility behavior.
Authoring versioning must remain independent of simulation engine versioning.

## Sub-agent schedule

Use at most three workers plus the coordinator. Waves follow dependency gates.

| Wave | Assignment | Exclusive ownership | Exit gate |
|---|---|---|---|
| A1 | Coordinator: freeze contracts | Proposed protocol `game-authoring.ts`, protocol exports and integration, saved metadata decision | Schemas, identity rules, override paths, limits, candidate/apply contract and legacy compatibility specified |
| A2 | Worker 1: retained builder | `packages/sandbox-packs/sandbox-game/sandbox/index.js`, shipped pack skill, sandbox-game tests | Explicit build units, declared inputs, stable keys, deterministic authoring seed and duplicate rejection |
| A2 | Worker 2: isolated bake | Proposed `packages/agents/src/game-code-bake.ts` and tests | Bounded candidate-only bake rejects external operations and reproduces validated native output |
| A2 | Worker 3: identity and reconciliation | Proposed game-runtime authoring modules and tests | Collision-safe identities and baseline/current/new reconciliation preserve manual entities and expose conflicts |
| A3 | Worker 1: prefab and parameter compilation | Authoring prefab/parameter modules and tests | Retained definition-instance relationships compile into existing 2D/3D representations |
| A3 | Worker 2: persistence and capabilities | `packages/models/src/game.ts`, game capabilities/specs and related tests | Preview is read-only, stale candidates fail, valid apply is atomic and persisted metadata round-trips |
| A3 | Worker 3: override edit operations | `document-ops.ts`, `document-ops3d.ts` and related tests | Property edits record overrides, deletes record suppression, reset/detach are explicit, replacement preserves ownership |
| A4 | Worker 1: editor integration | Game editors, inspectors, tree and preview controls with adjacent tests | Entity/dependency changes and conflicts are reviewable, inherited/generated/overridden fields are visible |
| A4 | Worker 2: session policy | `useGamePlaySession.ts`, `useGamePlaySession3D.ts` and tests | Active session retains definition/assets, restart uses rebuilt definition, runtime state never enters authoring |
| A4 | Worker 3: proof fixture and replay | Proposed retained-game fixture/tests, existing CLI game replay integration if needed | Second and third edits pass document assertions, fixed-input replay and captured-frame review |
| A5 | Coordinator: integration and verification | Shared exports, registry wiring, documentation, final diff | Required checks pass and fixture evidence is recorded |

The coordinator owns shared exports and registry changes. Workers must request
shared-file changes through the coordinator. Freeze A1 before A2 implementation.
A3 starts after the bake and reconciliation interfaces pass focused tests.
Editor presentational work may use typed fixtures earlier, but integration waits
for A3. Session tests and proof inputs may be prepared independently.

## Acceptance gates

- A6. Identical retained inputs and pinned resources reproduce identical output.
  Insertion, reorder and rename preserve IDs and references. Duplicate keys,
  ambiguous bindings and invalid references fail. Exercise large collections.
- A7. Deliberately forbidden network, generation, installation, secret and
  workspace calls fail during bake. Assert no writes or external calls occurred.
  Authoring and simulation RNG seeds remain separate.
- A8. Preview does not mutate draft, published revision or session. Concurrent
  editor changes and competing candidates cause stale apply rejection. Atomic
  failure leaves the saved draft intact.
- A9. Move one generated collectible and delete another. Change the layout and
  enemy parameters. Rebuild twice. Preserve the moved position, propagate other
  generated changes, retain suppression and hand-authored objects, and preserve
  references. Removing an overridden or referenced generated entity reports a
  conflict rather than transferring its identity.
- A10. Resetting an override restores its generated value. Detach converts
  generated ownership into manual ownership. Duplicates initially become detached
  copies. Suppression survives generator removal and later reappearance.
- A11. Legacy 2D and 3D documents remain readable without inferred ownership.
  Unsupported authoring versions fail clearly. Existing published revisions
  remain immutable.
- A12. Replay a fixed input route against the rebuilt definition with explicit
  win/state assertions and midpoint snapshot restoration. Review captured frames.
  Reuse the existing game replay harness rather than adding another simulator.

After code changes, build backend packages, then run `npm run test:affected`,
`npm run typecheck`, `npm run lint`, and
`npm run dev:nodetool -- harness gate --base origin/main`. Read the
[native game harness reference](../harnesses.md#native-game-pipeline-templates-staging-playtest-web-build)
before using the game harness. Instruction changes also require
`npm run check:agents-docs`.

## Risks and deferred work

- R1. Existing 3D prefab operations clone and remap entities but do not retain
  authoring relationships. Runtime snapshot prefab data cannot substitute for
  authoring metadata.
- R2. The 2D play hook reads live asset bindings. Pinning retained-project assets
  requires an explicit change and regression tests.
- R3. Behavior source identity currently includes array position. Treat behavior
  arrays atomically until stable behavior IDs have compatibility handling.
- R4. Whole-document edits could discard ownership. Define their behavior before
  enabling retained saves and validate every edit path that touches generated data.

After the delivery proof, schedule explicit behavior parameter/state bindings.
Reusable presentation follows with transform ownership and cancellation rules.
Defer arbitrary JavaScript-to-graph conversion, expression AST editing, nested
prefab overrides and unrestricted hot reload.

## Inspected foundations

- [Timeline retained capture](../timeline-code-capture.md) and
  [isolated bake](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/src/timeline-code-bake.ts).
- [Game builder](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/sandbox-game/sandbox/index.js).
- [2D schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game.ts) and
  [3D schema](https://github.com/nodetool-ai/nodetool/blob/main/packages/protocol/src/game3d.ts).
- [2D edit operations](https://github.com/nodetool-ai/nodetool/blob/main/packages/game-runtime/src/document-ops.ts) and
  [3D edit operations](https://github.com/nodetool-ai/nodetool/blob/main/packages/game-runtime/src/document-ops3d.ts).
- [Game persistence](https://github.com/nodetool-ai/nodetool/blob/main/packages/models/src/game.ts).
- [Game CLI](https://github.com/nodetool-ai/nodetool/blob/main/packages/cli/src/commands/game.ts) and
  [harness registry](https://github.com/nodetool-ai/nodetool/blob/main/packages/cli/src/harness/registry.ts).

The resulting interface is documented in
[Retained game construction](../game-retained-authoring.md).
