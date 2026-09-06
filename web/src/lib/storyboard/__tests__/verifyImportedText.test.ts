/**
 * D10: an import's words never come back from the model. These pin both
 * halves of criterion 5 — the parse survives a Director answer that rewrote
 * it, and the shot that was rewritten is named.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { Shot } from "@nodetool-ai/protocol";

import { applyCameraPass } from "../cameraPass";
import { parseFdx } from "../parseFdx";
import { verifyImportedText, type FdxVerification } from "../verifyImportedText";

const parsed = () =>
  parseFdx(
    readFileSync(
      join(__dirname, "..", "__fixtures__", "two-scenes.fdx"),
      "utf8"
    )
  );

const asFdx = (result: ReturnType<typeof verifyImportedText>): FdxVerification => {
  if (result.mode !== "fdx") {
    throw new Error("expected an FDX verification");
  }
  return result;
};

describe("verifyImportedText — FDX", () => {
  it("keeps the camera the Director chose", () => {
    const parse = parsed();
    const answered = applyCameraPass(parse, {
      shots: parse.shots.map((shot) => ({
        id: shot.id,
        camera: { framing: "wide", angle: "eye level", movement: "static" },
        motion: "The coat swings.",
        duration_seconds: 4
      }))
    });
    const result = asFdx(
      verifyImportedText({ mode: "fdx", parsed: parse, returned: answered })
    );
    expect(result.correctedShotIds).toEqual([]);
    expect(result.shots[0].camera).toEqual({
      framing: "wide",
      angle: "eye level",
      movement: "static"
    });
    expect(result.shots[0].duration_seconds).toBe(4);
  });

  it("restores rewritten dialogue and names the shot", () => {
    const parse = parsed();
    const answered = applyCameraPass(parse, {
      shots: parse.shots.map((shot) => {
        const answer: Record<string, unknown> = {
          id: shot.id,
          motion: "Handheld."
        };
        if (shot.id === "fdx-shot-2") {
          // The provider ignored the schema and rewrote the line.
          answer.dialogue = "Never again, I swear it.";
        }
        return answer;
      })
    });
    const result = asFdx(
      verifyImportedText({ mode: "fdx", parsed: parse, returned: answered })
    );
    expect(result.correctedShotIds).toEqual(["fdx-shot-2"]);
    expect(result.shots[1].dialogue).toBe(
      "SOPHIA\n(under her breath)\nNot today. Not again."
    );
  });

  it("restores a reordered answer to the parsed scene order", () => {
    const parse = parsed();
    const answered = applyCameraPass(parse, {
      shots: [...parse.shots].reverse().map((shot) => ({ id: shot.id }))
    });
    const result = asFdx(
      verifyImportedText({ mode: "fdx", parsed: parse, returned: answered })
    );
    expect(result.shots.map((shot) => shot.id)).toEqual([
      "fdx-shot-1",
      "fdx-shot-2",
      "fdx-shot-3",
      "fdx-shot-4"
    ]);
    expect(result.shots.map((shot) => shot.index)).toEqual([0, 1, 2, 3]);
    expect(result.correctedShotIds).toEqual([
      "fdx-shot-1",
      "fdx-shot-2",
      "fdx-shot-3",
      "fdx-shot-4"
    ]);
  });

  it("names a shot the answer dropped", () => {
    const parse = parsed();
    const answered = applyCameraPass(parse, {
      shots: parse.shots
        .filter((shot) => shot.id !== "fdx-shot-3")
        .map((shot) => ({ id: shot.id }))
    });
    const result = asFdx(
      verifyImportedText({ mode: "fdx", parsed: parse, returned: answered })
    );
    expect(result.correctedShotIds).toEqual(["fdx-shot-3"]);
    expect(result.shots).toHaveLength(4);
  });
});

describe("verifyImportedText — plain text", () => {
  const shot = (id: string, action: string, dialogue?: string): Shot => {
    const built: Shot = { type: "shot", id, index: 0, action, status: "planned" };
    if (dialogue !== undefined) {
      built.dialogue = dialogue;
    }
    return built;
  };

  it("returns the source lines no shot holds", () => {
    const result = verifyImportedText({
      mode: "text",
      source: [
        "A hand opens a door.",
        "",
        "She says: we are late.",
        "The dog stays behind."
      ].join("\n"),
      shots: [
        shot("s1", "A hand opens a door."),
        shot("s2", "A woman turns", "She says: we are late.")
      ]
    });
    expect(result).toEqual({
      mode: "text",
      missingLines: ["The dog stays behind."]
    });
  });

  it("counts a line the Director re-wrapped as present", () => {
    const result = verifyImportedText({
      mode: "text",
      source: "A hand   opens\tthe door.",
      shots: [shot("s1", "In close-up, a hand opens the door. Light spills in.")]
    });
    expect(result).toEqual({ mode: "text", missingLines: [] });
  });
});
