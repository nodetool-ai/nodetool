# Native C++ port source inventory

This inventory accompanies [the implementation plan](native-game-cpp-port.md). It records the inspected export surfaces, then assigns feature families to releases. Exports are reference points, not a promise of source compatibility.

## Inspected exports

### [packages/protocol/src/game.ts](../../packages/protocol/src/game.ts)

This file re-exports component modules. Follow its relative exports for field definitions.

### [packages/protocol/src/game3d/index.ts](../../packages/protocol/src/game3d/index.ts)

`gameEntity3D`, `GameEntity3D`, `gameScene3D`, `GameScene3D`, `gamePrefab3D`, `GamePrefab3D`, `gamePresentation3D`, `gameMaterials3D`, `GameMaterials3D`, `gameDocument3D`, `GameDocument3D`, `anyGameDocument`, `AnyGameDocument`, `gameDiagnostic`, `GameDiagnostic`, `ParseGameDocumentResult`, `parseGameDocument`, `gameInputFrame3D`, `GameInputFrame3D`, `gameEvent3D`, `GameEvent3D`, `gameAnimationState3D`, `GameAnimationState3D`, `gameRenderFrame3D`, `GameRenderFrame3D`, `gameEntityState3D`, `GameEntityState3D`, `gameCameraState3D`, `GameCameraState3D`, `gameNonSpatialScriptCommand`, `GameNonSpatialScriptCommand`, `gameQueryShape3D`, `GameQueryShape3D`, `gameScriptCommand3D`, `GameScriptCommand3D`, `gameQueryResult3D`, `GameQueryResult3D`, `gameSnapshot3D`, `GameSnapshot3D`, `GameInspectionQuery3D`, `GameInspection3D`, `GameStepResult3D`

### [packages/game-runtime/src/scripts.ts](../../packages/game-runtime/src/scripts.ts)

`gameScriptCommand`, `GameScriptCommand`, `GameScriptCall`, `GameScriptTouching`, `GameScriptResult`, `GameScriptStats`, `GameScriptBatch`, `GameScriptWorldEntity`, `GameScriptInput`, `GameScriptRunner`, `GameScriptSourceUpdate`, `hasGameScripts`, `GameScriptOptions`, `IsolatedScriptCall`, `IsolatedScriptInput`, `IsolatedScriptRunner`, `prepareIsolatedGameScripts`, `prepareGameScripts`

### [packages/game-runtime/src/script-types3d.ts](../../packages/game-runtime/src/script-types3d.ts)

`GAME_SCRIPT_TYPES_3D`, `GAME_SCRIPT_WORLD_TYPES_3D`, `GAME_SCRIPT_LIFECYCLE_TYPES_3D`

### [packages/game-runtime/src/script-lifecycle.ts](../../packages/game-runtime/src/script-lifecycle.ts)

`GAME_SCRIPT_HOOKS`, `GameScriptHook`, `MAX_GAME_SCRIPT_TIMERS`, `MAX_GAME_SCRIPT_TIMER_TICKS`, `GameScriptContact`, `GameScriptLifecycle`, `GameScriptTimer`, `GameScriptLifecycleRecord`, `isScriptLifecycleRecord`, `awaitsDestroy`, `GameScriptLimits`, `removedDestroyCall`, `assertDestroyCommands`, `scriptHookIssue`, `scriptContacts`, `scriptEvents`, `scriptLifecycle`, `GameScriptHookStep`, `GameScriptHookPlan`, `planScriptHooks`, `commitScriptHooks`, `SCRIPT_SYNCHRONOUS_RESULT`, `SCRIPT_LIFECYCLE_DISPATCH`

### [packages/game-runtime/src/document-ops3d.ts](../../packages/game-runtime/src/document-ops3d.ts)

`gameDocumentOp3D`, `GameDocumentOp3D`, `InstantiatedPrefab3D`, `instantiateGamePrefab3D`, `applyGameOps3D`, `anyGameDocumentOp`, `AnyGameDocumentOp`, `MAX_GAME_DRAFT_OPS`, `applyAnyGameOps`, `applyAnyGameOps`, `applyAnyGameOps`, `applyAnyGameOps`

### [packages/cli/src/commands/game.ts](../../packages/cli/src/commands/game.ts)

`registerGameCommands`

## Feature allocation

| Feature family | Release | Representation | Runtime owner | Agent operation and verification |
| --- | --- | --- | --- | --- |
| Version, identity, scene selection, revision | A1–A2 | Native document header | Document | Validate/save/reopen with fixture admission |
| Entity hierarchy and transforms | A2 | Scenes and entities | Document | Transaction/inspect, cycle and invalid-transform fixtures |
| Prefabs and explicit overrides | A2 | Prefab entities, instance props, typed prefabOverrides | Document | Add/resolve/undo, reference and dependency fixtures |
| Behaviors and script source | A2 then A3 execution | Script table and behavior references | Scripts | Install source, bounded execution fixtures |
| Asset bindings | A2 then A5 decoding | Asset table and entity assetIds | Assets | Set/remove binding, dangling-reference fixtures |
| Input actions | A2 then A4 execution | Input action table | Session | Configure/inject, input edge replay |
| Lifecycle hooks and tick timers | A3 | Explicit behavior state | Scripts | Run/inspect logs, ordered lifecycle fixtures |
| World queries and commands | A3–A4 | Typed script commands/results | Session | Execute/assert, next-tick response fixtures |
| Gameplay score, health, lifetime, collection | A4 | Native typed gameplay fields added before execution | Gameplay | Simulate/assert, failure and replay fixtures |
| Bodies, colliders, collision matrix, characters | A4 | Native physics fields added before execution | Physics | Simulate/query, course and snapshot fixtures |
| Snapshots and player saves | A4 | Separate versioned formats | Session | Snapshot/restore, midpoint replay assertions |
| Meshes, materials, lights, shadows, skeletal animation | A5 | Prepared asset/visual fields added before rendering | Renderer | Capture/inspect, visual and resource-lifetime fixtures |
| HUD, pointer input, audio and buses | A5 | Native presentation fields added before playback | Presentation/audio | Capture and input/audio verification |
| Agent discovery, diagnostics, assertions | A6 | Tool metadata and run reports | Host | Full public-interface creation loop |
| Inspector, hierarchy, transforms, history, persistence | A7 | Shared document transactions | Editor | UI/agent interleaving and revision-conflict tests |
| Standalone native export | A8 | Closed document/asset manifest bundle | Host | Clean-machine installation and offline play |
| 2D sprites, tilemaps, collision, lights, backgrounds | A8.3 | Native schema 5 with scene overrides, sprite image metadata and animation | Shared session and 2D spatial/presentation systems | Create/edit/save/reopen/run/restore/capture and installed standalone fixture |
| Web export, touch controls, browser storage | A8.4 | Browser host adapters | Browser host | Browser/native semantic fixtures |
| Particles, decals, fog, post effects, animation graphs | Later feature expansion | Explicit native fields | Presentation | Per-feature authoring and capture fixtures |
| Legacy schema migration, Rapier snapshot conversion | Removed from port scope | None | None | Explicit unsupported-version errors |

Fields for later execution milestones must be added to the canonical native schema before implementation. The A1–A2 contract intentionally rejects unknown fields rather than accepting opaque physics or renderer extensions. Existing TS fixture outputs guide test cases without defining native compatibility.

## Prefab override contract

An instance may set `prefabOverrides` for direct entities of its referenced prefab.
Each target appears once. Overrides replace supplied name, transform, behaviors,
and asset IDs, and shallow-merge supplied properties into the template properties.
Identity, hierarchy, and prefab references cannot be overridden. Nested prefab
instances retain their own expansion rules. An override may target a nested
instance anchor, but cannot address an arbitrary expanded descendant.

Nonempty overrides require a prefab reference. Native semantic validation rejects
missing targets, duplicate targets, dangling script or asset references, invalid
quaternions, and zero scale. Empty overrides are normalized onto ordinary entities.
