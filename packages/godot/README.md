# @nodetool-ai/godot

Godot 4 text formats, as a pure library: a `FilledManifest` from
`@nodetool-ai/protocol` goes in, the text files of a Godot project and the list
of stored assets to copy come out. Nothing here reads pixels or touches disk.

```ts
import {
  checkGodotProject,
  readTres,
  writeGodotProject
} from "@nodetool-ai/godot";

const project = writeGodotProject({
  name: "Platformer",
  godot: "4.3",
  mainScene: "res://scenes/level_01.tscn",
  manifest, // GameAssetManifest, the template's slots
  filled // FilledManifest, what the generation nodes produced
});

project.files; // project.godot, assets/sprites/*.tres, assets/tiles/*.tres, assets/audio/*.import
project.copies; // { path, asset_id } for every stored asset the project needs
checkGodotProject(project); // [] when every ExtResource/SubResource and path resolves
readTres(project.files[1].content); // header + blocks, the same grammar as .tscn
```

What each slot kind becomes:

| Fill | Copy | File |
| --- | --- | --- |
| `spritesheet` | `assets/sprites/<id>.png` | `assets/sprites/<id>.tres`, a `SpriteFrames` with one `AtlasTexture` per frame |
| `tileset` | `assets/tiles/<id>.png` | `assets/tiles/<id>.tres`, a `TileSet` with one `TileSetAtlasSource` |
| `image` | `assets/images/<id>.png` | none |
| `sfx`, `music` | `assets/audio/<id>.<ext>` | `assets/audio/<id>.<ext>.import` with the loop flag |

`<id>` is the slot id with dots replaced by underscores. Every `uid://` and
resource id is a hash of the slot id and asset id, so re-exporting after one
asset was regenerated changes only that slot's files.

Tests compare the fixture output byte-for-byte against `tests/golden/`;
`UPDATE_GOLDEN=1 npx vitest run` rewrites the golden files.
