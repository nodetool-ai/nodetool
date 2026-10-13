import { describe, expect, it } from "vitest";
import { gameScene } from "../src/game.js";

describe("streaming scene music schema", () => {
  it("accepts an explicit streaming loop while preserving old music documents", () => {
    const scene = { id: "room", name: "Room", entities: [], music: { assetId: "music" } };
    expect(gameScene.parse(scene).music).toEqual({ assetId: "music", volume: 1, fadeInTicks: 0, fadeOutTicks: 0 });
    expect(gameScene.parse({ ...scene, music: { ...scene.music, streaming: { loopEndSeconds: 120 } } }).music?.streaming)
      .toEqual({ loopStartSeconds: 0, loopEndSeconds: 120 });
  });
  it.each([
    { loopStartSeconds: -1 }, { loopStartSeconds: 86401 }, { loopEndSeconds: 0 },
    { loopEndSeconds: 86401 }, { loopStartSeconds: 20, loopEndSeconds: 20 },
    { loopStartSeconds: 20, loopEndSeconds: 10 }, { loopStartSeconds: Infinity }, { loopEndSeconds: NaN }
  ])("rejects invalid loop settings %j", (streaming) => {
    expect(gameScene.safeParse({ id: "room", name: "Room", entities: [], music: { assetId: "music", streaming } }).success).toBe(false);
  });
});
