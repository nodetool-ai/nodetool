import { describe, expect, it } from "vitest";

import { checkGodotProject, writeGodotProject } from "../src/index.js";
import { platformerInput } from "./fixture.js";

describe("checkGodotProject", () => {
  it("accepts the fixture output", () => {
    expect(checkGodotProject(writeGodotProject(platformerInput()))).toEqual([]);
  });

  it("reports an ext_resource whose file was not copied", () => {
    const project = writeGodotProject(platformerInput());
    project.copies = project.copies.filter((c) => c.path !== "assets/sprites/player.png");
    expect(checkGodotProject(project)).toEqual([
      "assets/sprites/player.tres: ext_resource path res://assets/sprites/player.png is not in the project"
    ]);
  });

  it("reports a dangling SubResource after a sub_resource id is renamed", () => {
    const project = writeGodotProject(platformerInput());
    const tiles = project.files.find((f) => f.path === "assets/tiles/tiles_ground.tres")!;
    const id = /\[sub_resource type="TileSetAtlasSource" id="([^"]+)"\]/.exec(tiles.content)![1];
    tiles.content = tiles.content.replace(
      `[sub_resource type="TileSetAtlasSource" id="${id}"]`,
      '[sub_resource type="TileSetAtlasSource" id="TileSetAtlasSource_other"]'
    );
    expect(checkGodotProject(project)).toEqual([
      `assets/tiles/tiles_ground.tres: [resource] references SubResource("${id}") which is not declared`
    ]);
  });

  it("reports a dangling ExtResource and a wrong load_steps", () => {
    const project = writeGodotProject(platformerInput());
    const tiles = project.files.find((f) => f.path === "assets/tiles/tiles_ground.tres")!;
    tiles.content = tiles.content
      .replace(/\[ext_resource [^\n]*\n/, "")
      .replace("load_steps=3", "load_steps=2");
    const problems = checkGodotProject(project);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/references ExtResource\("1_[a-z0-9]{5}"\) which is not declared/);

    tiles.content = tiles.content.replace("load_steps=2", "load_steps=7");
    expect(checkGodotProject(project)).toContain(
      "assets/tiles/tiles_ground.tres: load_steps=7, declares 2"
    );
  });

  it("reports a file the reader cannot parse", () => {
    const problems = checkGodotProject({
      files: [{ path: "scenes/bad.tscn", content: "not a scene" }],
      copies: []
    });
    expect(problems).toEqual(["scenes/bad.tscn: text before the first block: not a scene"]);
  });
});
