---
layout: page
title: "Retained Construction and Overrides"
permalink: /game-engine/construction
description: "Rebuild generated games while preserving deliberate manual changes."
---

Retained construction stores the program and inputs that produced a game. You can change a parameter, preview the resulting document, and apply the rebuild while preserving recorded manual overrides.

![Diagram of a draft, construction preview, reviewed apply, and separate publication](/assets/game-engine/authoring-flow.svg)

*Preview does not save. Apply checks the accepted preview against the current draft. Publishing is a separate step.*

## Construct with stable identity

The sandbox game builder's `constructGame({inputs, seed}, callback)` returns a construction bundle for `saveGame`. The callback has explicit inputs and cannot close over outside variables. Give generated objects and prefab instances explicit keys. Names and construction order do not define their identity.

Retained metadata records the program, inputs, seed, generated baseline, parameter schemas, and prefab relationships. The resulting document still uses the ordinary 2D or 3D schema. A hand-authored document does not need construction metadata.

## Review a rebuild

Open **Retained construction**, change source or inputs, and choose **Preview rebuild**. Review changed entities, dependencies, conflicts, and whether play must restart. **Highlight changes** selects affected entities in the viewport. Apply is disabled for stale previews and unresolved conflicts.

The API exposes the same sequence through `nodetool.games.previewAuthoring` and `applyAuthoring`. Apply rebakes and compares the candidate, then checks that the draft timestamp and digest still match. It does not publish the result.

## Preserve manual work

Moving a generated entity records a property override. A later generated scale change can still apply while the manual position remains. Deleting a generated object records suppression. Detaching transfers it out of generated ownership. Resetting an override returns that field to construction control.

Removing an overridden or referenced object, colliding with a manual ID, or making competing scene-setting changes creates a conflict. Resolve the ownership decision instead of blindly replacing the draft. Behavior arrays are atomic override values.

Rebuild programs cannot use network, media storage, secrets, workspace access, or host modules. Prepare resources before construction and pass accepted bindings as inputs. Use the builder's seeded random source for reproducible placement.

An active play session keeps its accepted document and assets. Restart to adopt a rebuild. Runtime spawning, collection, and death never become authored entities automatically.

The [retained-authoring reference](https://github.com/nodetool-ai/nodetool/blob/main/docs/game-retained-authoring.md) documents ownership operations and the delivery proof. The [builder reference](https://github.com/nodetool-ai/nodetool/blob/main/packages/sandbox-packs/sandbox-game/SKILL.md) contains its callable API.
