import {
  checkFilledManifest,
  type FilledSlot,
  type MusicFill,
  type SfxFill,
  type SpritesheetFill,
  type TilesetFill,
  type TilesetSlotSpec
} from "@nodetool-ai/protocol";

import { extResourceId, resourceUid, subResourceId } from "./ids.js";
import type {
  GodotCopy,
  GodotFile,
  GodotProject,
  GodotProjectInput
} from "./types.js";

/** `enemy.walker` → `enemy_walker`: a slot id as a file stem. */
export function slotFileStem(slotId: string): string {
  return slotId.replace(/\./g, "_");
}

/** Pixel region of frame `index` on a row-major sheet of `cell`-sized frames. */
export function frameRegion(
  fill: Pick<SpritesheetFill, "cell" | "columns">,
  index: number
): { x: number; y: number; w: number; h: number } {
  const [w, h] = fill.cell;
  return {
    x: (index % fill.columns) * w,
    y: Math.floor(index / fill.columns) * h,
    w,
    h
  };
}

function quote(text: string): string {
  return `"${text.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

/** Godot prints floats with at least one decimal. */
function real(value: number): string {
  return Number.isInteger(value) ? `${value}.0` : String(value);
}

function resourceHeader(
  type: string,
  loadSteps: number,
  uid: string
): string {
  return `[gd_resource type=${quote(type)} load_steps=${loadSteps} format=3 uid=${quote(uid)}]`;
}

function textureExtResource(
  id: string,
  uid: string,
  path: string
): string {
  return `[ext_resource type="Texture2D" uid=${quote(uid)} path=${quote(path)} id=${quote(id)}]`;
}

function spriteFrames(slot: FilledSlot, fill: SpritesheetFill): {
  file: GodotFile;
  copy: GodotCopy;
} {
  const stem = slotFileStem(slot.slot_id);
  const assetId = slot.asset.asset_id;
  const pngPath = `assets/sprites/${stem}.png`;
  const textureId = extResourceId(1, slot.slot_id, assetId, "sheet");
  const textureUid = resourceUid(slot.slot_id, assetId, "sheet");
  const frameCount = fill.columns * fill.rows;
  const frameIds: string[] = [];
  const subResources: string[] = [];
  for (let i = 0; i < frameCount; i++) {
    const id = subResourceId("AtlasTexture", slot.slot_id, assetId, `frame${i}`);
    const r = frameRegion(fill, i);
    frameIds.push(id);
    subResources.push(
      [
        `[sub_resource type="AtlasTexture" id=${quote(id)}]`,
        `atlas = ExtResource(${quote(textureId)})`,
        `region = Rect2(${r.x}, ${r.y}, ${r.w}, ${r.h})`
      ].join("\n")
    );
  }
  const animations = Object.entries(fill.animations).map(([name, range]) => {
    const frames: string[] = [];
    for (let i = range.from; i <= range.to; i++) {
      frames.push(
        `{\n"duration": 1.0,\n"texture": SubResource(${quote(frameIds[i])})\n}`
      );
    }
    return [
      "{",
      `"frames": [${frames.join(", ")}],`,
      `"loop": ${range.loop},`,
      `"name": &${quote(name)},`,
      `"speed": ${real(range.fps)}`,
      "}"
    ].join("\n");
  });
  const content = [
    resourceHeader("SpriteFrames", 1 + 1 + frameCount, resourceUid(slot.slot_id, assetId, "frames")),
    "",
    textureExtResource(textureId, textureUid, `res://${pngPath}`),
    "",
    ...subResources.map((s) => `${s}\n`),
    "[resource]",
    `animations = [${animations.join(", ")}]`,
    ""
  ].join("\n");
  return {
    file: { path: `assets/sprites/${stem}.tres`, content },
    copy: { path: pngPath, asset_id: assetId }
  };
}

function tileSet(
  slot: FilledSlot,
  fill: TilesetFill,
  spec: TilesetSlotSpec
): {
  file: GodotFile;
  copy: GodotCopy;
} {
  const stem = slotFileStem(slot.slot_id);
  const assetId = slot.asset.asset_id;
  const pngPath = `assets/tiles/${stem}.png`;
  const textureId = extResourceId(1, slot.slot_id, assetId, "sheet");
  const textureUid = resourceUid(slot.slot_id, assetId, "sheet");
  const sourceId = subResourceId("TileSetAtlasSource", slot.slot_id, assetId, "atlas");
  const [w, h] = fill.cell;
  // The slot says which tiles collide. A template's TileMapLayer relies on
  // the physics layer, so a floor tile given a polygon walls the room off.
  const hw = w / 2;
  const hh = h / 2;
  const polygon = `PackedVector2Array(${-hw}, ${-hh}, ${hw}, ${-hh}, ${hw}, ${hh}, ${-hw}, ${hh})`;
  const solid = spec.solid === "all" ? null : new Set(spec.solid);
  const tiles: string[] = [];
  for (let i = 0; i < fill.count; i++) {
    const cell = `${i % fill.columns}:${Math.floor(i / fill.columns)}/0`;
    tiles.push(`${cell} = 0`);
    if (solid === null || solid.has(i)) {
      tiles.push(`${cell}/physics_layer_0/polygon_0/points = ${polygon}`);
    }
  }
  const content = [
    resourceHeader("TileSet", 3, resourceUid(slot.slot_id, assetId, "tileset")),
    "",
    textureExtResource(textureId, textureUid, `res://${pngPath}`),
    "",
    `[sub_resource type="TileSetAtlasSource" id=${quote(sourceId)}]`,
    `texture = ExtResource(${quote(textureId)})`,
    `texture_region_size = Vector2i(${w}, ${h})`,
    ...tiles,
    "",
    "[resource]",
    `tile_size = Vector2i(${w}, ${h})`,
    "physics_layer_0/collision_layer = 1",
    `sources/0 = SubResource(${quote(sourceId)})`,
    ""
  ].join("\n");
  return {
    file: { path: `assets/tiles/${stem}.tres`, content },
    copy: { path: pngPath, asset_id: assetId }
  };
}

const AUDIO_IMPORTERS = {
  ogg: { importer: "oggvorbisstr", type: "AudioStreamOggVorbis" },
  wav: { importer: "wav", type: "AudioStreamWAV" },
  mp3: { importer: "mp3", type: "AudioStreamMP3" }
} as const;

type AudioExtension = keyof typeof AUDIO_IMPORTERS;

function audioExtension(uri: string): AudioExtension {
  const match = /\.([a-z0-9]+)$/i.exec(uri);
  const ext = match ? match[1].toLowerCase() : "ogg";
  if (!(ext in AUDIO_IMPORTERS)) {
    throw new Error(`no Godot importer for audio ${uri}`);
  }
  return ext as AudioExtension;
}

function audio(slot: FilledSlot, fill: SfxFill | MusicFill): {
  file: GodotFile;
  copy: GodotCopy;
} {
  const stem = slotFileStem(slot.slot_id);
  const assetId = slot.asset.asset_id;
  const ext = audioExtension(slot.asset.uri);
  const { importer, type } = AUDIO_IMPORTERS[ext];
  const path = `assets/audio/${stem}.${ext}`;
  const loop = fill.kind === "music" && fill.loop;
  const params =
    ext === "wav"
      ? [`edit/loop_mode=${loop ? 1 : 0}`]
      : [`loop=${loop}`];
  const content = [
    "[remap]",
    "",
    `importer=${quote(importer)}`,
    `type=${quote(type)}`,
    `uid=${quote(resourceUid(slot.slot_id, assetId, "audio"))}`,
    "",
    "[deps]",
    "",
    `source_file=${quote(`res://${path}`)}`,
    "",
    "[params]",
    "",
    ...params,
    ""
  ].join("\n");
  return {
    file: { path: `${path}.import`, content },
    copy: { path, asset_id: assetId }
  };
}

function projectGodot(input: GodotProjectInput): GodotFile {
  const application = [
    `config/name=${quote(input.name)}`,
    ...(input.mainScene ? [`run/main_scene=${quote(input.mainScene)}`] : []),
    `config/features=PackedStringArray(${quote(input.godot)})`
  ];
  const content = [
    "; Engine configuration file.",
    "; It's best edited using the editor UI and not directly,",
    "; since the parameters that go here are not all obvious.",
    ";",
    "; Format:",
    ";   [section] ; section goes between []",
    ";   param=value ; assign values to parameters",
    "",
    "config_version=5",
    "",
    "[application]",
    "",
    ...application,
    "",
    "[rendering]",
    "",
    "textures/canvas_textures/default_texture_filter=0",
    ""
  ].join("\n");
  return { path: "project.godot", content };
}

/**
 * Turn a filled manifest into a Godot project: `project.godot`, one resource
 * per spritesheet/tileset slot, one `.import` sidecar per audio slot, and the
 * list of stored assets to copy in. No pixels are read: the fills say where
 * every frame is.
 *
 * Throws when the filled manifest does not satisfy the template's manifest.
 */
export function writeGodotProject(input: GodotProjectInput): GodotProject {
  const problems = checkFilledManifest(input.manifest, input.filled);
  const failing = Object.entries(problems);
  if (failing.length > 0) {
    const text = failing
      .map(([id, list]) => `${id || "manifest"}: ${list.join("; ")}`)
      .join("\n");
    throw new Error(`filled manifest rejected:\n${text}`);
  }
  const files: GodotFile[] = [projectGodot(input)];
  const copies: GodotCopy[] = [];
  const specs = new Map(input.manifest.slots.map((s) => [s.id, s]));
  const slots = [...input.filled.slots].sort((a, b) =>
    a.slot_id < b.slot_id ? -1 : a.slot_id > b.slot_id ? 1 : 0
  );
  for (const slot of slots) {
    const fill = slot.fill;
    switch (fill.kind) {
      case "spritesheet": {
        const out = spriteFrames(slot, fill);
        files.push(out.file);
        copies.push(out.copy);
        break;
      }
      case "tileset": {
        const spec = specs.get(slot.slot_id);
        if (spec?.kind !== "tileset") {
          throw new Error(`slot ${slot.slot_id} is not a tileset in the manifest`);
        }
        const out = tileSet(slot, fill, spec);
        files.push(out.file);
        copies.push(out.copy);
        break;
      }
      case "image": {
        copies.push({
          path: `assets/images/${slotFileStem(slot.slot_id)}.png`,
          asset_id: slot.asset.asset_id
        });
        break;
      }
      case "sfx":
      case "music": {
        const out = audio(slot, fill);
        files.push(out.file);
        copies.push(out.copy);
        break;
      }
    }
  }
  return { files, copies };
}
