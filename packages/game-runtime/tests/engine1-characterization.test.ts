import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gameDocument, gameInputFrame } from "@nodetool-ai/protocol";
import { createTopDownRoomGame } from "../src/sample.js";
import { createScriptedGameSession, createGameSession } from "../src/session.js";

function characterize(): string[] {
  const document = createTopDownRoomGame("engine1-characterization");
  const session = createGameSession(document, 23);
  try {
    const hashes: string[] = [];
    for (let tick = 0; tick < 80; tick += 1) {
      const result = session.step({ pressed: tick < 40 ? ["right"] : ["left", "up"], justPressed: [] });
      hashes.push(createHash("sha256").update(JSON.stringify({ result, snapshot: session.snapshot() })).digest("hex"));
    }
    return hashes;
  } finally {
    session.dispose();
  }
}

describe("engine 1 compatibility", () => {
  it("preserves ordered events, render data and snapshot wire output at every tick", () => {
    const expected: unknown = JSON.parse(readFileSync(new URL("./fixtures/engine1-characterization.json", import.meta.url), "utf8"));
    expect(characterize()).toEqual(expected);
  });
});

interface ContractFixture { document: unknown; inputs: unknown[]; hashes: string[] }

it("preserves every legacy behavior and script command through the shared gameplay extraction", async () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/engine1-all-contracts.json", import.meta.url), "utf8")) as ContractFixture;
  const document = gameDocument.parse(fixture.document);
  const session = await createScriptedGameSession(document, 9);
  try {
    const hashes = fixture.inputs.map((input) => {
      const result = session.step(gameInputFrame.parse(input));
      return createHash("sha256").update(JSON.stringify({ tick: result.tick, events: result.events, frame: result.frame, snapshot: session.snapshot() })).digest("hex");
    });
    expect(hashes).toEqual(fixture.hashes);
    expect(new Set(document.scenes.flatMap((scene) => scene.entities.flatMap((entity) => entity.behaviors.map((behavior) => behavior.kind))))).toEqual(
      new Set(["movement", "health", "winWhenCollected", "script", "collectible", "trigger", "patrol", "spawn", "sceneTransition", "lifetime"]));
  } finally { session.dispose(); }
});
