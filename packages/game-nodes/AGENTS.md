# game-nodes — Godot Templates, Slot Prompts, Project Export

**Navigation**: [packages/AGENTS.md](../AGENTS.md) → **game-nodes**

> Read [packages/AGENTS.md](../AGENTS.md) first (output-contract, media-ref and
> defaults rules apply). This overlay covers the template end of the Godot
> pipeline.

`nodetool.game.LoadGameTemplate`, `SlotPrompt` and `ExportGodotProject`. The
per-slot **checkers** are not here: they live with the bytes they measure —
`SpriteSheet`, `Tileset`, `SeamlessImage` in
[image-nodes](../image-nodes/AGENTS.md), `SoundEffect`, `MusicLoop` in
[audio-nodes](../audio-nodes/AGENTS.md). This package joins
`@nodetool-ai/godot` (the writer), `@nodetool-ai/godot-templates` (the shipped
projects and the headless runner) and `@nodetool-ai/protocol` (the slot
contract, and `slotPrompt`).

- **Nothing decides layout twice.** Sizes, prompts and the checker prop bag are
  `slotPrompt` in `@nodetool-ai/protocol/game-slot-prompt.ts`, so the node, the
  `godot-game` skill, the editor and the Game guided flow's `game-flow-prompt.ts`
  agree by construction. A checker reads the
  same bag off its `game_slot` input, which is why a connected slot beats every
  hand-typed number beside it.
- **`ExportGodotProject` takes the checker's `output`, not its `fill`.** A
  `SlotFill` says how the sheet is laid out and nothing about where its bytes
  are. The export refuses a bare fill with the wiring that fixes it, rather than
  writing a project whose art is missing (`resolveFills`, `src/fills.ts`).
- **An asset with no id gets one from its slot.** In a run whose context cannot
  create assets every checker returns its ref inline, so `resolveFills` derives
  the id from `slotFileStem(slot_id)`. That keeps resource uids deterministic
  and matches the golden fixture in `@nodetool-ai/godot`.
- **The template's `project.godot` wins over the writer's.** It carries the
  input map and the window settings; only `config/name` is substituted. Same
  rule as the `godot` agent capability, which `src/project.ts` mirrors —
  including audio-reference rewriting when a filled slot's extension differs
  from the placeholder's, and `refresh` mode, which keeps the scripts and scenes
  an agent already edited when a re-export only changes art.
- **The template list is read at module load and must never throw.** The
  `template` dropdown's options come from `listTemplates()` while the node
  registry is being built, and the packaged Electron backend does not stage
  `godot-templates/templates/`. The read is wrapped: an empty dropdown there,
  not a registry that fails to load. Export needs the real directory, so it
  fails at run time with that reason instead.
- **A skipped verification is never green.** `verified` is true only when Godot
  actually imported the project, checked every script and ran the smoke scene
  with no objection. No local directory or no `GODOT_BIN` reports the reason in
  `errors` and leaves `verified` false.
- **An unfilled slot keeps the template's placeholder.** Only the slots that
  were filled reach the writer, so a creator who kept the placeholder audio
  (game-prd D27) and the blank-template export with no fills at all both
  produce a project that runs. The `export_godot_project` capability wants every
  slot and checks the whole manifest itself before calling the same join.
- **Structural failures throw; findings are reported.** An unknown template, a
  missing workspace, a bare fill or a fill for a slot the template does not have
  stop the node. Dangling `res://` references and Godot's own complaints come
  back in `errors` so a retry loop can read them.
