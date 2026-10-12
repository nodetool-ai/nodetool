import type { Scene, Shot } from "@nodetool-ai/protocol";
import { matchesShotQuery, searchSceneGroups } from "../shotSearch";
import type { SceneGroup } from "../../../lib/storyboard/sceneOrder";

const shot = (id: string, patch: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id,
  index: 0,
  action: "",
  status: "planned",
  ...patch
});

describe("matchesShotQuery", () => {
  it("matches every shot for an empty or blank query", () => {
    expect(matchesShotQuery(shot("a"), "")).toBe(true);
    expect(matchesShotQuery(shot("a"), "   ")).toBe(true);
  });

  it("matches words in any order and any case across fields", () => {
    const target = shot("a", {
      action: "A lighthouse at dusk",
      dialogue: "Keep the lamp burning"
    });
    expect(matchesShotQuery(target, "LAMP lighthouse")).toBe(true);
    expect(matchesShotQuery(target, "lighthouse storm")).toBe(false);
  });

  it("matches the caption and the scene slugline", () => {
    const target = shot("a", { action: "Waves" });
    expect(
      matchesShotQuery(
        target,
        "shot 3",
        "Scene 2 | Shot 3",
        "EXT. CLIFF - NIGHT"
      )
    ).toBe(true);
    expect(
      matchesShotQuery(target, "cliff", undefined, "EXT. CLIFF - NIGHT")
    ).toBe(true);
  });
});

describe("searchSceneGroups", () => {
  const scene = (id: string, slugline: string): Scene =>
    ({ id, slugline }) as unknown as Scene;
  const groups: SceneGroup[] = [
    {
      sceneId: "s1",
      scene: scene("s1", "INT. KITCHEN"),
      shots: [
        shot("a", { action: "Kettle boils" }),
        shot("b", { action: "Door opens" })
      ]
    },
    {
      sceneId: "s2",
      scene: scene("s2", "EXT. GARDEN"),
      shots: [shot("c", { action: "Rain on leaves" })]
    }
  ];

  it("keeps only matching shots and drops scenes without a match", () => {
    const result = searchSceneGroups(groups, "rain", new Map());
    expect(result.map((group) => group.sceneId)).toEqual(["s2"]);
    expect(result[0].shots.map((value) => value.id)).toEqual(["c"]);
  });

  it("keeps each scene's number from the full board", () => {
    const result = searchSceneGroups(groups, "garden", new Map());
    expect(result[0].number).toBe(2);
  });

  it("returns every group unchanged in content for an empty query", () => {
    const result = searchSceneGroups(groups, "", new Map());
    expect(result.map((group) => group.shots.length)).toEqual([2, 1]);
    expect(result.map((group) => group.number)).toEqual([1, 2]);
  });
});
