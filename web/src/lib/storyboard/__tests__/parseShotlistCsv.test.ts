/**
 * Criterion 17: a CSV missing a required header is refused naming it, a
 * multiline quoted cell imports intact, and an invalid duration or an unknown
 * vocabulary value imports with the field unset and appears in the report.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseShotlistCsv, type ShotlistImport } from "../parseShotlistCsv";

const fixture = readFileSync(
  join(__dirname, "..", "__fixtures__", "shotlist.csv"),
  "utf8"
);

const imported = (csv: string): ShotlistImport => {
  const result = parseShotlistCsv(csv);
  if (!result.ok) {
    throw new Error(`expected a parse, got: ${result.error}`);
  }
  return result.result;
};

describe("parseShotlistCsv", () => {
  it("refuses a file missing a required header, naming it", () => {
    const result = parseShotlistCsv("scene,shot,dialogue\nINT. HALL,1,Hello\n");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable");
    }
    expect(result.missingColumns).toEqual(["description"]);
    expect(result.error).toContain("description");
  });

  it("names both headers when both are missing", () => {
    const result = parseShotlistCsv("shot,dialogue\n1,Hello\n");
    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("unreachable");
    }
    expect(result.missingColumns).toEqual(["scene", "description"]);
  });

  it("imports a multiline quoted dialogue cell intact", () => {
    const { shots } = imported(fixture);
    const maya = shots.find((shot) => shot.action.startsWith("Maya"));
    expect(maya?.dialogue).toBe(
      "MAYA\n(over the noise)\nTwo more, then we stop.\nNot one more than that."
    );
  });

  it("keeps an embedded comma inside a quoted description", () => {
    const { shots } = imported(fixture);
    expect(shots[1].action).toBe("A lathe spins, throwing curls of brass.");
  });

  it("sorts by the shot column and reindexes in scene order", () => {
    const { scenes, shots } = imported(fixture);
    expect(scenes.map((scene) => scene.slugline)).toEqual([
      "INT. WORKSHOP - NIGHT",
      "Scene 2"
    ]);
    expect(
      shots.map((shot) => ({ action: shot.action.slice(0, 4), index: shot.index }))
    ).toEqual([
      { action: "Maya", index: 0 },
      { action: "A la", index: 1 },
      { action: "Rain", index: 2 }
    ]);
    expect(shots.map((shot) => shot.scene_id)).toEqual([
      "csv-scene-1",
      "csv-scene-1",
      "csv-scene-2"
    ]);
  });

  it("matches the vocabularies case-insensitively", () => {
    const { shots } = imported(
      "scene,description,size,perspective,movement,equipment,focal_length\n" +
        "INT. HALL - DAY,A door,CLOSE-UP,Low Angle,Dolly In,STEADICAM,85MM\n"
    );
    expect(shots[0].camera).toEqual({
      framing: "close-up",
      angle: "low angle",
      movement: "dolly in",
      equipment: "steadicam",
      lens: "85mm"
    });
  });

  it("imports an unknown vocabulary value unset and reports it", () => {
    const { shots, report } = imported(fixture);
    const rain = shots[2];
    expect(rain.camera?.framing).toBeUndefined();
    expect(rain.camera?.angle).toBe("eye level");
    expect(report).toContainEqual(
      expect.objectContaining({ row: 4, column: "size", value: "mega-wide" })
    );
  });

  it("imports an invalid duration unset and reports it", () => {
    const { shots, report } = imported(fixture);
    expect(shots[2].duration_seconds).toBeUndefined();
    expect(shots[0].duration_seconds).toBe(6);
    expect(report).toContainEqual(
      expect.objectContaining({
        row: 4,
        column: "duration_seconds",
        value: "not-a-number"
      })
    );
  });

  it("skips a row with an empty description and reports it", () => {
    const { shots, report } = imported(fixture);
    expect(shots).toHaveLength(3);
    expect(report).toContainEqual(
      expect.objectContaining({ row: 5, column: "description", value: "" })
    );
  });

  it("reports every discarded value in file order", () => {
    expect(imported(fixture).report.map((entry) => entry.row)).toEqual([
      4, 4, 5
    ]);
  });

  // The template the step serves has to survive the parser it is a template
  // for, or `Download template` hands out a file the import then refuses.
  it("imports the shipped template with nothing discarded", () => {
    const template = readFileSync(
      join(__dirname, "..", "..", "..", "..", "public", "storyboard-shotlist-template.csv"),
      "utf8"
    );
    const { scenes, shots, report } = imported(template);
    expect(report).toEqual([]);
    expect(scenes).toHaveLength(2);
    expect(shots).toHaveLength(3);
    expect(shots.every((shot) => shot.camera?.framing !== undefined)).toBe(true);
  });

  it("names a scene that is not a slugline by its position", () => {
    const { scenes } = imported(
      "scene,description\nOpening,A door\nINT./EXT. CAR - DAY,A wheel\n"
    );
    expect(scenes.map((scene) => scene.slugline)).toEqual([
      "Scene 1",
      "INT./EXT. CAR - DAY"
    ]);
  });
});
