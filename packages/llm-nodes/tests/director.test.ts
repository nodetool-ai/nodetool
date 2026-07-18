import { describe, it, expect } from "vitest";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import {
  parseScreenplay,
  composeShotPrompt,
  injectEntities
} from "../src/nodes/director.js";

describe("parseScreenplay", () => {
  it("parses a JSON string and assigns ids, indices, and status", () => {
    const raw = JSON.stringify({
      title: "Sunrise Run",
      shots: [{ action: "A runner crests a hill" }, { action: "Wide valley" }]
    });
    const screenplay = parseScreenplay(raw, { shotCount: 2 });
    expect(screenplay.type).toBe("screenplay");
    expect(screenplay.id).toBe("screenplay-1");
    expect(screenplay.title).toBe("Sunrise Run");
    expect(screenplay.shots).toHaveLength(2);
    expect(screenplay.shots[0]).toMatchObject({
      id: "shot-0",
      index: 0,
      status: "planned",
      action: "A runner crests a hill"
    });
    expect(screenplay.shots[1].id).toBe("shot-1");
    expect(screenplay.shots[1].index).toBe(1);
  });

  it("parses a fenced ```json block", () => {
    const raw = "```json\n" + JSON.stringify({ title: "T", shots: [{ action: "x" }] }) + "\n```";
    const screenplay = parseScreenplay(raw, { shotCount: 1 });
    expect(screenplay.title).toBe("T");
    expect(screenplay.shots).toHaveLength(1);
    expect(screenplay.shots[0].action).toBe("x");
  });

  it("clamps the shot list to shotCount", () => {
    const raw = {
      title: "Many",
      shots: [
        { action: "a" },
        { action: "b" },
        { action: "c" },
        { action: "d" }
      ]
    };
    const screenplay = parseScreenplay(raw, { shotCount: 2 });
    expect(screenplay.shots).toHaveLength(2);
    expect(screenplay.shots.map((s) => s.index)).toEqual([0, 1]);
  });

  it("defaults missing fields", () => {
    const screenplay = parseScreenplay({}, { shotCount: 3, aspectRatio: "9:16" });
    expect(screenplay.title).toBe("Untitled Screenplay");
    expect(screenplay.aspect_ratio).toBe("9:16");
    expect(screenplay.shots).toEqual([]);
    expect(screenplay.narration).toBeUndefined();
  });
});

describe("composeShotPrompt", () => {
  it("merges action, camera, motion, and style bible", () => {
    const screenplay = { style_bible: "muted teal, 35mm film grain" } as Screenplay;
    const shot: Shot = {
      type: "shot",
      id: "shot-0",
      index: 0,
      action: "A lighthouse at dusk",
      camera: { framing: "wide", lens: "85mm", movement: "slow push in" },
      motion: "waves crash below",
      status: "planned"
    };
    const prompt = composeShotPrompt(shot, screenplay);
    expect(prompt).toContain("A lighthouse at dusk");
    expect(prompt).toContain("wide");
    expect(prompt).toContain("85mm");
    expect(prompt).toContain("slow push in");
    expect(prompt).toContain("waves crash below");
    expect(prompt).toContain("muted teal, 35mm film grain");
  });
});

describe("injectEntities", () => {
  it("injects the descriptor and collects reference images when named in text", () => {
    const entities = [
      {
        type: "entity",
        id: "e1",
        kind: "character",
        name: "Mara",
        descriptor: "a tall woman with copper hair",
        reference_images: [{ type: "image", uri: "asset://mara.png" }]
      }
    ];
    const result = injectEntities("Mara walks into the room", entities);
    expect(result.prompt).toContain("Mara walks into the room");
    expect(result.prompt).toContain("Consistency references:");
    expect(result.prompt).toContain("Mara: a tall woman with copper hair");
    expect(result.reference_images).toHaveLength(1);
    expect(result.reference_images[0].uri).toBe("asset://mara.png");
  });

  it("applies all entities when the text is empty and skips unmatched ones", () => {
    const entities = [
      { name: "Mara", descriptor: "copper hair" },
      { name: "Rex", descriptor: "a black dog" }
    ];
    const empty = injectEntities("", entities);
    expect(empty.prompt).toContain("Mara: copper hair");
    expect(empty.prompt).toContain("Rex: a black dog");

    const named = injectEntities("Rex sprints", entities);
    expect(named.prompt).toContain("Rex: a black dog");
    expect(named.prompt).not.toContain("Mara: copper hair");
  });
});
