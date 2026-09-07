# @nodetool-ai/game-nodes

The `nodetool.game.*` template nodes: read a shipped Godot template's asset
manifest, turn one slot into a generation job, and write the filled project.

| Node | In | Out |
|---|---|---|
| `LoadGameTemplate` | `template` | `manifest`, `slots`; streams `slot` |
| `SlotPrompt` | `slot`, `style`, `cast` | `prompt`, `width`, `height`, `kind`, `checker`, `seconds` |
| `ExportGodotProject` | `template`, `name`, `fills`, `directory`, `verify` | `output`, `directory`, `files`, `verified`, `verification`, `errors`, `archive` |

The checkers that accept a generated asset for a slot live with the bytes they
measure: `nodetool.game.SpriteSheet`, `Tileset` and `SeamlessImage` in
`@nodetool-ai/image-nodes`, `SoundEffect` and `MusicLoop` in
`@nodetool-ai/audio-nodes`. All five take the same `game_slot` value this
package streams.

The Game guided flow ends every graph it builds on `ExportGodotProject`, so its
`output` handle and the `<directory>.zip` beside the project are what the
landing checklist reads.

Rules and gotchas: [AGENTS.md](AGENTS.md).
