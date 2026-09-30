# Retained game construction

Native 2D and 3D drafts can retain the construction that built them. Preparation
produces accepted resources. A bounded construction program uses literal inputs
and pinned asset bindings to produce a native document. Play executes that
document with separate session state.

## Construct and save

Read the [game builder pack](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/sandbox-game/SKILL.md).
`constructGame({inputs, seed}, (inputs, builder) => { return document; })` returns
a bundle for `saveGame`. The callback has explicit inputs and cannot close over
outer variables. The builder provides typed parameters, prefab definitions and
instances with explicit keys. Names and construction order do not supply IDs.

Retained metadata stores the program, inputs, authoring seed, generated baseline,
parameter schemas and prefab relationships. Native documents keep their existing
2D or 3D schema version. Documents without retained metadata remain supported.

## Review and apply a rebuild

`nodetool.games.previewAuthoring(id, {program})` returns a candidate with changed
entities, dependencies, conflicts and a restart requirement. Omit `program` to
rebuild the saved construction. Preview writes no draft or publication.

`nodetool.games.applyAuthoring(id, candidate)` rebakes and compares the result to
the preview. It saves only if the draft timestamp and digest still match and all
conflicts are resolved. Publishing remains a separate operation.

The Game editor exposes construction source, inputs and typed parameter controls.
Preview highlights affected entities. Apply is disabled for stale candidates or
unresolved conflicts. Rebuilds reject external capabilities, including network,
workspace, media storage, secrets and host modules. Use `builder.random()` for
seeded authoring randomness.

## Continue editing

Moving a generated object records property overrides. A later scale change can
propagate while its overridden position remains intact. Deleting a generated
object records suppression, which survives later rebuilds. The inspector exposes
inherited, generated and overridden fields, prefab identity, reset and detach.
Suppressed objects can be restored from the construction panel.

Removing a referenced or overridden generated object, colliding with a manual
object's ID, or making competing changes to scene settings produces a conflict.
Reset the manual override, detach the object, or adjust construction to resolve
it. Behavior arrays are atomic override values. Rebuilding does not migrate live
behavior state.

Active retained-game sessions keep their accepted definition and asset bindings.
Restart play to adopt a rebuilt draft. Runtime spawn, collection and death state
never becomes authored content.

## Verification

The [delivery fixture](https://github.com/nodetool-ai/nodetool/blob/main/packages/agents/tests/game-retained-authoring-proof.test.ts)
moves a collectible, suppresses another, changes player and prefab parameters,
then rebuilds twice and verifies a fixed-input win with snapshot restoration and
captured frames. Use the existing
[game replay harness](harnesses.md#native-game-pipeline-templates-staging-playtest-web-build)
for additional routes.
