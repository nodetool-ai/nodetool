# game-nodes — Native Game Asset Nodes

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **game-nodes**

Read [Development Standards](../../docs/DEVELOPMENT_STANDARDS.md) and the
[package rules](../AGENTS.md) before editing nodes. The node output and media
reference rules apply here.

`LoadGameTemplate` exposes the native template's asset slots. `SlotPrompt`
turns a slot into generator and checker inputs. `StageGameAssets` accepts the
checker's stamped `output` media reference, validates its fill against the
template, reads its bytes through `loadMediaRefBytes`, and writes a
content-addressed candidate under `games/<full-game-id>/assets/`.

Staging does not modify `game.json` or a current revision. The authorized game
operation installs selected bindings with compare-and-swap publication. A
generation rerun therefore cannot replace scene or behavior edits. The slot
layout logic is shared with [game assets](../protocol/src/game-assets.ts) and
[slot prompting](../protocol/src/game-slot-prompt.ts).

`ExportGodotProject` is removed. Legacy workflows must fail validation with
the explicit [migration diagnostic](../protocol/src/game-migration.ts), so a
project export cannot silently become an asset installation.
