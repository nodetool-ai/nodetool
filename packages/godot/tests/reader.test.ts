import { describe, expect, it } from "vitest";

import {
  readTres,
  readTscn,
  referencedIds,
  writeGodotProject,
  type GodotBlock,
  type TscnDocument
} from "../src/index.js";
import { platformerInput } from "./fixture.js";

/** Print a parsed document back in Godot's block grammar. */
function print(doc: TscnDocument): string {
  const block = (b: GodotBlock): string => {
    const attrs = Object.entries(b.attributes)
      .map(([k, v]) => (/^-?\d+$/.test(v) ? `${k}=${v}` : `${k}="${v}"`))
      .join(" ");
    const head = attrs ? `[${b.kind} ${attrs}]` : `[${b.kind}]`;
    const props = Object.entries(b.properties).map(([k, v]) => `${k} = ${v}`);
    return [head, ...props].join("\n");
  };
  return [doc.header, ...doc.blocks].map(block).join("\n\n");
}

const SCENE = `[gd_scene load_steps=3 format=3 uid="uid://c0ffee1234abc"]

[ext_resource type="SpriteFrames" uid="uid://player0000000" path="res://assets/sprites/player.tres" id="1_abcde"]
[ext_resource type="Script" path="res://scripts/player.gd" id="2_fghij"]

[node name="Player" type="CharacterBody2D"]
script = ExtResource("2_fghij")
metadata/_edit_group_ = true

[node name="Sprite" type="AnimatedSprite2D" parent="."]
sprite_frames = ExtResource("1_abcde")
animation = &"idle"
autoplay = "idle"

[connection signal="animation_finished" from="Sprite" to="." method="_on_animation_finished"]
`;

describe("readTscn", () => {
  it("reads header, ext_resources, nodes and connections", () => {
    const doc = readTscn(SCENE);
    expect(doc.header.kind).toBe("gd_scene");
    expect(doc.header.attributes).toEqual({
      load_steps: "3",
      format: "3",
      uid: "uid://c0ffee1234abc"
    });
    expect(doc.blocks.map((b) => b.kind)).toEqual([
      "ext_resource",
      "ext_resource",
      "node",
      "node",
      "connection"
    ]);
    expect(doc.blocks[1].attributes).toEqual({
      type: "Script",
      path: "res://scripts/player.gd",
      id: "2_fghij"
    });
    expect(doc.blocks[3].attributes.parent).toBe(".");
    expect(doc.blocks[3].properties).toEqual({
      sprite_frames: 'ExtResource("1_abcde")',
      animation: '&"idle"',
      autoplay: '"idle"'
    });
    expect(doc.blocks[4].attributes.method).toBe("_on_animation_finished");
    expect(referencedIds(doc.blocks[2])).toEqual({ ext: ["2_fghij"], sub: [] });
  });

  it("keeps a multi-line value together", () => {
    const doc = readTres(
      '[gd_resource type="X" format=3]\n\n[resource]\nlist = [{\n"a": 1\n}]\nnext = 2\n'
    );
    expect(doc.blocks[0].properties).toEqual({ list: '[{\n"a": 1\n}]', next: "2" });
  });

  it("rejects text outside a block", () => {
    expect(() => readTscn("hello")).toThrow(/text before the first block/);
    expect(() => readTscn("[node name=\"A\"]\n")).toThrow(/missing \[gd_scene\]/);
  });

  it("round-trips every emitted .tres", () => {
    const project = writeGodotProject(platformerInput());
    const resources = project.files.filter((f) => f.path.endsWith(".tres"));
    expect(resources.length).toBeGreaterThan(0);
    for (const file of resources) {
      const doc = readTres(file.content);
      expect(doc.header.kind, file.path).toBe("gd_resource");
      const again = readTres(print(doc));
      expect(again, file.path).toEqual(doc);
      const ext = doc.blocks.filter((b) => b.kind === "ext_resource").length;
      const sub = doc.blocks.filter((b) => b.kind === "sub_resource").length;
      expect(Number(doc.header.attributes.load_steps), file.path).toBe(1 + ext + sub);
      expect(doc.blocks.at(-1)?.kind, file.path).toBe("resource");
    }
  });

  it("parses a crafted header in linear time instead of backtracking", () => {
    // The shape CodeQL flagged: `[A A=` followed by many `"" A=` repetitions and
    // no closing quote. The old regex took exponential time here.
    const line = `[A A=${'"" A='.repeat(40)}`;
    const started = performance.now();
    expect(() => readTscn(`${line}\n`)).toThrow();
    expect(performance.now() - started).toBeLessThan(200);
  });

  it("reads escaped quotes and bare attribute values", () => {
    const doc = readTscn(
      '[gd_scene format=3]\n\n[node name="a \\"b\\"" type=Node2D]\n'
    );
    expect(doc.blocks[0].attributes).toEqual({ name: 'a "b"', type: "Node2D" });
  });
});
