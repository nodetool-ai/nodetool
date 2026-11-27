import { describe, expect, it } from "vitest";
import { gameDocument, type GameDocument, type GameInputFrame } from "@nodetool-ai/protocol";

import { GAME_BOT_DECISION_MAX_TICKS, parseGameBotSpec, runGameBot, type GameBotSpec } from "../src/bot.js";
import { createTopDownRoomGame } from "../src/sample.js";
import { replayScriptedGame } from "../src/session.js";

const room = (): GameDocument => createTopDownRoomGame("b".repeat(32));

/** A room whose script fails only when the player presses left, the path a careful route never takes. */
function roomWithHintBug(): GameDocument {
  const base = room();
  const source = `(input) => { if (input.justPressed.includes("left")) { showHint(); } return { state: null, commands: [] }; }`;
  return gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
    ...scene.entities, { id: "hints", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands: 4, maxTickMs: 20 }] }
  ] })) });
}

/**
 * Walks toward the gem it can see when its roll for that gem is under its skill, otherwise stands still.
 * It decides every 10 ticks but rolls once per gem, so a weak bot cannot retry its way to success.
 */
const GEM_POLICY = `({
  decide(view, bot) {
    const gem = view.sprites.find((sprite) => sprite.assetId === "gem");
    const player = view.sprites.find((sprite) => sprite.assetId === "player");
    if (!gem || !player) { return { ticks: 10 }; }
    const skilled = bot.rollFor("gem:" + gem.entityId) < bot.skill;
    const toward = gem.x > player.x ? "right" : "left";
    return { hold: skilled ? [toward] : [], ticks: 10, state: { seen: (bot.state?.seen ?? 0) + 1 } };
  }
})`;

const skill = (value: number, source = GEM_POLICY): GameBotSpec => parseGameBotSpec(String(value), source);

describe("game bots", () => {
  it("lets a skilled policy bot win and a skill 0 bot fail on the same seed", async () => {
    const best = await runGameBot(room(), { bot: skill(1), seed: 1, ticks: 600 });
    expect(best).toMatchObject({ ended: true, endReason: "win", won: true, score: 1 });
    expect(best.endTick).toBeGreaterThan(0);
    expect(best.decisions).toBe(Math.ceil(best.endTick! / 10));
    const worst = await runGameBot(room(), { bot: skill(0), seed: 1, ticks: 600 });
    expect(worst).toMatchObject({ ended: false, endTick: null, won: false, ticks: 600 });
  });

  it("rolls once per game decision, so a weak bot wins at about its skill over many seeds", async () => {
    let wins = 0;
    const seeds = 40;
    for (let seed = 0; seed < seeds; seed += 1) {
      const result = await runGameBot(room(), { bot: skill(0.25), seed, ticks: 300 });
      if (result.won) { wins += 1; }
    }
    expect(wins / seeds).toBeGreaterThan(0.05);
    expect(wins / seeds).toBeLessThan(0.5);
    // The same policy rolling afresh at every 10-tick decision drifts to the gem in most runs.
    const rerolling = skill(0.25, GEM_POLICY.replace('bot.rollFor("gem:" + gem.entityId)', "bot.roll"));
    let rerollWins = 0;
    for (let seed = 0; seed < seeds; seed += 1) {
      if ((await runGameBot(room(), { bot: rerolling, seed, ticks: 300 })).won) { rerollWins += 1; }
    }
    expect(rerollWins).toBeGreaterThan(wins * 2);
  });

  it("finds a script fault that only the button-mashing edge bot reaches", async () => {
    const idle = await runGameBot(roomWithHintBug(), { bot: parseGameBotSpec("idle"), seed: 1, ticks: 120 });
    expect(idle).toMatchObject({ ended: false, ticks: 120 });
    expect(idle.error).toBeUndefined();
    const mash = await runGameBot(roomWithHintBug(), { bot: parseGameBotSpec("mash"), seed: 1, ticks: 120 });
    expect(mash.error).toMatchObject({ tick: 1 });
    expect(mash.error?.message).toMatch(/showHint/);
  });

  it("holds every action from the first tick and never releases it", async () => {
    const frames: GameInputFrame[] = [];
    const actions = room().inputActions;
    const result = await runGameBot(room(), { bot: parseGameBotSpec("hold"), seed: 1, ticks: GAME_BOT_DECISION_MAX_TICKS + 5,
      prepareInput: (input) => { frames.push(input); return input; } });
    expect(result.decisions).toBe(2);
    expect(frames[0]).toEqual({ pressed: actions, justPressed: actions });
    expect(frames[1]).toEqual({ pressed: actions, justPressed: [] });
    // The second decision keeps holding, so the actions are not pressed again.
    expect(frames[GAME_BOT_DECISION_MAX_TICKS]).toEqual({ pressed: actions, justPressed: [] });
  });

  it("presses every action on every other tick with the mash bot", async () => {
    const frames: GameInputFrame[] = [];
    await runGameBot(room(), { bot: parseGameBotSpec("mash"), seed: 1, ticks: 4, prepareInput: (input) => { frames.push(input); return input; } });
    const all = room().inputActions;
    expect(frames).toEqual([{ pressed: all, justPressed: all }, { pressed: [], justPressed: [] }, { pressed: all, justPressed: all }, { pressed: [], justPressed: [] }]);
  });

  it("is deterministic for a seed and leaves the game's random stream untouched", async () => {
    const frames: GameInputFrame[] = [];
    const first = await runGameBot(room(), { bot: parseGameBotSpec("random"), seed: 7, ticks: 240, prepareInput: (input) => { frames.push(input); return input; } });
    const second = await runGameBot(room(), { bot: parseGameBotSpec("random"), seed: 7, ticks: 240 });
    expect(second).toEqual(first);
    const replayed = await replayScriptedGame(room(), 7, frames);
    expect(replayed.snapshot.score).toBe(first.score);
    expect(replayed.snapshot.tick).toBe(first.ticks);
  });

  it("ends a session on a named trigger event", async () => {
    const base = room();
    const source = `(input) => ({ state: null, commands: input.tick === 30 ? [{ kind: "emit", event: "lose" }] : [] })`;
    const document = gameDocument.parse({ ...base, schemaVersion: 4, engineVersion: "3", scenes: base.scenes.map((scene) => ({ ...scene, entities: [
      ...scene.entities, { id: "judge", transform2d: { x: -5, y: 2 }, behaviors: [{ kind: "script", source, maxCommands: 4, maxTickMs: 20 }] }
    ] })) });
    const result = await runGameBot(document, { bot: parseGameBotSpec("idle"), seed: 1, ticks: 120, endEvents: ["lose"] });
    expect(result).toMatchObject({ ended: true, endReason: "event", endEvent: "lose", won: false });
    expect(result.endTick).toBeGreaterThanOrEqual(30);
    expect(result.endTick).toBeLessThan(40);
  });

  it("gives the policy only public view fields and no clock", async () => {
    const policy = `(view, bot) => { if (bot.decisions === 1) { throw new Error("saw " + JSON.stringify(bot.state)); } return { ticks: 1, state: {
      keys: Object.keys(view).sort(), spriteKeys: Object.keys(view.sprites[0]).sort(), date: typeof Date, repeat: bot.rollFor("a") === bot.rollFor("a")
    } }; }`;
    const result = await runGameBot(room(), { bot: skill(0.5, policy), seed: 1, ticks: 5 });
    const seen = JSON.parse(result.error!.message.replace(/^.*saw /, "")) as Record<string, unknown>;
    expect(seen.keys).toEqual(["camera", "height", "hud", "score", "sceneId", "sprites", "tick", "width", "won"].sort());
    expect(seen.spriteKeys).toEqual(["assetId", "entityId", "height", "layer", "width", "x", "y"].sort());
    expect(seen.date).toBe("undefined");
    expect(seen.repeat).toBe(true);
  });

  it("rejects unknown actions, invalid decisions and bad bot values", async () => {
    const unknown = await runGameBot(room(), { bot: skill(1, `() => ({ tap: ["fly"], ticks: 1 })`), seed: 1, ticks: 5 });
    expect(unknown.error?.message).toMatch(/unknown action "fly"/);
    const invalid = await runGameBot(room(), { bot: skill(1, `() => ({ hold: ["left"] })`), seed: 1, ticks: 5 });
    expect(invalid.error?.message).toMatch(/invalid decision/);
    const slow = await runGameBot(room(), { bot: skill(1, `() => { for (;;) {} }`), seed: 1, ticks: 5 });
    expect(slow.error?.message).toMatch(/bot decide exceeded/);
    expect(() => parseGameBotSpec("1.5", "() => ({ ticks: 1 })")).toThrow(/skill from 0 to 1/);
    expect(() => parseGameBotSpec("0.5")).toThrow(/needs a bot file/);
    expect(() => parseGameBotSpec("idle", "() => ({ ticks: 1 })")).toThrow(/takes no bot file/);
    await expect(runGameBot(room(), { bot: skill(1, `42`), seed: 1, ticks: 1 })).rejects.toThrow(/function or an object with decide/);
  });
});
