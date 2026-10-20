import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { gameDocument, gameInputFrame } from "@nodetool-ai/protocol";
import { createScriptedGameSession } from "../src/session.js";

async function kindle() {
  return gameDocument.parse(JSON.parse(await readFile(new URL("../samples/kindle/game.json", import.meta.url), "utf8")));
}

describe("Kindle run", () => {
  it("relights every brazier on the recorded route and shows the win panel", async () => {
    const route = gameInputFrame.array().parse(JSON.parse(await readFile(new URL("../samples/kindle/completion.inputs.json", import.meta.url), "utf8")));
    const session = await createScriptedGameSession(await kindle(), 1);
    const cues: Record<string, number[]> = { checkpoint: [], victory: [], hurt: [] };
    try {
      for (const input of route) {
        const result = session.step(input);
        for (const event of result.events) {
          if (event.kind === "trigger" && event.event in cues) { cues[event.event].push(result.tick); }
        }
      }
      expect(cues.checkpoint).toHaveLength(4);
      expect(cues.victory).toEqual([3334]);
      expect(cues.hurt).toEqual([]);
      const ui = session.snapshot().ui;
      expect(ui?.["ember-count"]?.text).toBe("46 / 73");
      expect([0, 1, 2, 3].map((index) => ui?.[`pip${index}-lit`]?.visible)).toEqual([true, true, true, true]);
      expect(ui?.["win-panel"]?.visible).toBe(true);
      expect(ui?.["win-stats"]?.text).toBe("46 of 73 embers  ·  0:55  ·  fallen 0");
    } finally {
      session.dispose();
    }
  }, 60_000);

  it("splashes when the hero falls into a flooded pit", async () => {
    const document = await kindle();
    const hero = document.scenes[1].entities.find((entity) => entity.id === "hero");
    if (!hero?.transform2d) { throw new Error("The hero is missing"); }
    // With no brazier lit the hero respawns where it started, so it falls in again after 45 ticks.
    hero.transform2d.x = 30;
    hero.transform2d.y = 1;
    document.entrySceneId = "temple";
    const session = await createScriptedGameSession(document, 1);
    const idle = gameInputFrame.parse({ pressed: [] });
    const splashes: number[] = [];
    try {
      for (let tick = 0; tick < 90; tick++) {
        const result = session.step(idle);
        if (result.events.some((event) => event.kind === "trigger" && event.event === "splash")) { splashes.push(result.tick); }
      }
      expect(splashes).toEqual([23, 89]);
      expect(session.snapshot().ui?.fallen).toEqual({ text: "FALLEN 2", visible: true });
    } finally {
      session.dispose();
    }
  }, 60_000);
});
