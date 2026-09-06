import { describe, expect, it } from "vitest";
import {
  clipPrompt,
  directClipPrompt,
  keyframePrompt,
  sceneForShot,
  type ShotPromptContext
} from "../src/shot-prompt.js";
import type { Scene, Shot } from "../src/creative.js";

const ACTION = "Sophia pulls the door shut behind her";

const shot = (overrides: Partial<Shot> = {}): Shot => ({
  type: "shot",
  id: "sh_1",
  index: 0,
  action: ACTION,
  status: "planned",
  ...overrides
});

const scene: Scene = {
  type: "scene",
  id: "sc_1",
  slugline: "INT. SOPHIA'S FLAT — HALLWAY — EARLY MORNING",
  lighting: "cold window light, one practical"
};

/**
 * One row of the § 7.7.5 matrix: a fixture carrying exactly that field, the
 * text it must put in a prompt, and the modes that take it.
 */
interface MatrixRow {
  field: string;
  fixture: Shot;
  context: ShotPromptContext;
  text: string;
  still: boolean;
  clip: boolean;
  direct: boolean;
}

const row = (
  field: string,
  text: string,
  modes: { still: boolean; clip: boolean; direct: boolean },
  parts: { shot?: Partial<Shot>; context?: ShotPromptContext } = {}
): MatrixRow => ({
  field,
  fixture: shot(parts.shot),
  context: parts.context ?? {},
  text,
  ...modes
});

const MATRIX: MatrixRow[] = [
  row("action", ACTION, { still: true, clip: true, direct: true }),
  row(
    "camera.framing",
    "wide shot",
    { still: true, clip: false, direct: true },
    { shot: { camera: { framing: "wide" } } }
  ),
  row(
    "camera.angle",
    "low angle",
    { still: true, clip: false, direct: true },
    { shot: { camera: { angle: "low angle" } } }
  ),
  row(
    "camera.lens",
    "85mm lens",
    { still: true, clip: false, direct: true },
    { shot: { camera: { lens: "85mm" } } }
  ),
  row(
    "scene lighting",
    "cold window light, one practical",
    { still: true, clip: false, direct: true },
    { context: { scene } }
  ),
  row(
    "motion",
    "she breaks into a run",
    { still: false, clip: true, direct: true },
    { shot: { motion: "she breaks into a run" } }
  ),
  row(
    "camera.movement",
    "slow push in",
    { still: false, clip: true, direct: true },
    { shot: { camera: { movement: "slow push in" } } }
  ),
  row(
    "camera.equipment",
    "steadicam",
    { still: false, clip: true, direct: true },
    { shot: { camera: { equipment: "steadicam" } } }
  ),
  row(
    "board style",
    "grainy 16mm, muted palette",
    { still: true, clip: false, direct: true },
    { context: { style: "grainy 16mm, muted palette" } }
  )
];

describe("§ 7.7.5 field → mode matrix", () => {
  for (const cell of MATRIX) {
    it(`${cell.field}: still=${cell.still} clip=${cell.clip} direct=${cell.direct}`, () => {
      const prompts = {
        still: keyframePrompt(cell.fixture, cell.context),
        clip: clipPrompt(cell.fixture),
        direct: directClipPrompt(cell.fixture, cell.context)
      };
      expect(prompts.still.includes(cell.text)).toBe(cell.still);
      expect(prompts.clip.includes(cell.text)).toBe(cell.clip);
      expect(prompts.direct.includes(cell.text)).toBe(cell.direct);
    });
  }
});

describe("fields that never reach a prompt", () => {
  const loaded = shot({
    camera: {
      framing: "medium",
      angle: "eye level",
      lens: "50mm",
      movement: "handheld drift",
      equipment: "gimbal"
    },
    motion: "she breaks into a run",
    dialogue: "You said you would wait for me",
    notes: "reshoot if the door sticks",
    duration_seconds: 7
  });
  const context: ShotPromptContext = { scene, style: "grainy 16mm" };
  const prompts = [
    keyframePrompt(loaded, context),
    clipPrompt(loaded),
    directClipPrompt(loaded, context)
  ];

  it("omits dialogue, notes and duration_seconds", () => {
    for (const prompt of prompts) {
      expect(prompt).not.toContain("You said you would wait for me");
      expect(prompt).not.toContain("reshoot if the door sticks");
      expect(prompt).not.toContain("7");
    }
  });

  it("joins with ', ' and drops empties", () => {
    for (const prompt of prompts) {
      expect(prompt).not.toMatch(/(^,|,\s*,|,\s*$)/);
      expect(prompt.trim()).toBe(prompt);
    }
  });
});

describe("a bare shot", () => {
  const bare = shot();

  it("composes to just its action", () => {
    expect(keyframePrompt(bare)).toBe(ACTION);
    expect(clipPrompt(bare)).toBe(ACTION);
    expect(directClipPrompt(bare)).toBe(ACTION);
  });

  it("ignores an empty style and a scene with no lighting", () => {
    const context: ShotPromptContext = {
      scene: { type: "scene", id: "sc_2", slugline: "EXT. STREET — DAY" },
      style: "   "
    };
    expect(keyframePrompt(bare, context)).toBe(ACTION);
    expect(directClipPrompt(bare, context)).toBe(ACTION);
  });
});

describe("full ordering", () => {
  const loaded = shot({
    camera: {
      framing: "wide",
      angle: "low angle",
      lens: "85mm",
      movement: "slow push in",
      equipment: "steadicam"
    },
    motion: "she breaks into a run"
  });
  const context: ShotPromptContext = { scene, style: "grainy 16mm" };

  it("keeps action first and style last on the still", () => {
    expect(keyframePrompt(loaded, context)).toBe(
      `${ACTION}, wide shot, low angle, 85mm lens, cold window light, one practical, grainy 16mm`
    );
  });

  it("keeps motion before action on a keyframe-mode clip", () => {
    expect(clipPrompt(loaded)).toBe(
      `she breaks into a run, ${ACTION}, slow push in, steadicam`
    );
  });

  it("carries every field on a direct clip", () => {
    expect(directClipPrompt(loaded, context)).toBe(
      `${ACTION}, wide shot, low angle, 85mm lens, cold window light, one practical, she breaks into a run, slow push in, steadicam, grainy 16mm`
    );
  });
});

describe("sceneForShot", () => {
  it("finds the shot's scene", () => {
    expect(sceneForShot(shot({ scene_id: "sc_1" }), [scene])).toBe(scene);
  });

  it("returns null for a legacy shot, a missing scene, and no list", () => {
    expect(sceneForShot(shot(), [scene])).toBeNull();
    expect(sceneForShot(shot({ scene_id: "sc_gone" }), [scene])).toBeNull();
    expect(sceneForShot(shot({ scene_id: "sc_1" }))).toBeNull();
  });
});
