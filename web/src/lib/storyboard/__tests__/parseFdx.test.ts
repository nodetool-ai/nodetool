/**
 * The FDX parse is what makes an imported script deterministic (criterion 5):
 * the text and the order these assertions pin are the text and the order the
 * review step shows, with no model in between.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseFdx } from "../parseFdx";

const fixture = (name: string): string =>
  readFileSync(join(__dirname, "..", "__fixtures__", name), "utf8");

describe("parseFdx", () => {
  const two = () => parseFdx(fixture("two-scenes.fdx"));

  it("reads one scene per Scene Heading, in order", () => {
    const { scenes } = two();
    expect(scenes.map((scene) => scene.slugline)).toEqual([
      "INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING",
      "EXT. CANAL PATH - MINUTES LATER"
    ]);
  });

  it("keeps every line verbatim and in order", () => {
    const { shots } = two();
    expect(
      shots.map((shot) => ({
        action: shot.action,
        dialogue: shot.dialogue,
        scene: shot.scene_id,
        index: shot.index
      }))
    ).toEqual([
      {
        action: "Sophia pulls a coat off the hook, keys already in her teeth.",
        dialogue: undefined,
        scene: "fdx-scene-1",
        index: 0
      },
      {
        action: "SOPHIA (under her breath)",
        dialogue: "SOPHIA\n(under her breath)\nNot today. Not again.",
        scene: "fdx-scene-1",
        index: 1
      },
      {
        action: "She runs the towpath. A barge slides the other way.",
        dialogue: undefined,
        scene: "fdx-scene-2",
        index: 2
      },
      {
        action: "BARGEMAN",
        dialogue:
          "BARGEMAN\nYou dropped something back there!\nTwo streets, maybe three.",
        scene: "fdx-scene-2",
        index: 3
      }
    ]);
  });

  it("drops a transition rather than making a shot of it", () => {
    const { shots } = two();
    expect(shots.some((shot) => shot.action.includes("CUT TO:"))).toBe(false);
  });

  it("imports an FDX with no Scene Heading as one scene named Scene 1", () => {
    const result = parseFdx(
      `<FinalDraft><Content>
         <Paragraph Type="Action"><Text>A hand opens a door.</Text></Paragraph>
       </Content></FinalDraft>`
    );
    expect(result.scenes).toEqual([
      { type: "scene", id: "fdx-scene-1", slugline: "Scene 1" }
    ]);
    expect(result.shots).toHaveLength(1);
    expect(result.shots[0].scene_id).toBe("fdx-scene-1");
  });

  it("reads the screenplay back as text for the idea step", () => {
    expect(two().text).toBe(
      [
        "INT. SOPHIA'S FLAT - HALLWAY - EARLY MORNING",
        "Sophia pulls a coat off the hook, keys already in her teeth.",
        "SOPHIA\n(under her breath)\nNot today. Not again.",
        "EXT. CANAL PATH - MINUTES LATER",
        "She runs the towpath. A barge slides the other way.",
        "BARGEMAN\nYou dropped something back there!\nTwo streets, maybe three."
      ].join("\n\n")
    );
  });

  it("refuses a file that is not a screenplay", () => {
    expect(() => parseFdx("this is not xml at all")).toThrow(Error);
  });
});
