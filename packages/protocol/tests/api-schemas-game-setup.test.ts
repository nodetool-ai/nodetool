import { describe, expect, it } from "vitest";

import {
  gameSetup,
  gameSetupStage,
  readGameSetup,
  readWorkflowSetup,
  writeGameSetup,
  writeWorkflowSetup,
  workflowSettingsWithGame
} from "../src/api-schemas/workflows.js";

describe("workflow settings.game", () => {
  it("reads null from a workflow that never went through the flow", () => {
    expect(workflowSettingsWithGame.safeParse({ hide_ui: false }).success).toBe(
      true
    );
    expect(readGameSetup({ hide_ui: false })).toBeNull();
    expect(readGameSetup(null)).toBeNull();
    expect(readGameSetup(undefined)).toBeNull();
    expect(readGameSetup({})).toBeNull();
  });

  it("round-trips every stage", () => {
    for (const stage of gameSetupStage.options) {
      const settings = writeGameSetup({}, { stage });
      expect(readGameSetup(settings)?.stage).toBe(stage);
    }
  });

  it("defaults a bare game bag to stage done, so a legacy value opens the editor", () => {
    expect(gameSetup.parse({}).stage).toBe("done");
  });

  it("keeps every other settings key, the Workflow flow's setup included", () => {
    const withSetup = writeWorkflowSetup(
      { hide_ui: true, someone_elses: { a: 1 } },
      { brief: "a workflow brief", stage: "category" }
    );
    const settings = writeGameSetup(withSetup, {
      brief: "A fox platformer through an autumn forest",
      stage: "template"
    });
    expect(settings["hide_ui"]).toBe(true);
    expect(settings["someone_elses"]).toEqual({ a: 1 });
    expect(readWorkflowSetup(settings)).toMatchObject({
      brief: "a workflow brief",
      stage: "category"
    });
    expect(readGameSetup(settings)).toMatchObject({
      brief: "A fox platformer through an autumn forest",
      stage: "template"
    });
  });

  it("merges into the game bag already there rather than replacing it", () => {
    const first = writeGameSetup({}, { brief: "b", stage: "template" });
    const second = writeGameSetup(first, { template: "platformer" });
    const third = writeGameSetup(second, { stage: "look" });
    expect(readGameSetup(third)).toMatchObject({
      brief: "b",
      stage: "look",
      template: "platformer"
    });
  });

  it("round-trips a whole design", () => {
    const design = {
      title: "Ember Run",
      premise: "A fox runs east.",
      core_loop: "Run, jump, stomp.",
      player_verbs: ["run", "jump"],
      enemies: [
        { slot_id: "enemy.walker", name: "Husk beetle", behaviour: "Patrols." }
      ],
      level: "A ridge in three beats.",
      win: "Reach the tree.",
      lose: "Fall off.",
      cast: [{ slot_id: "player", name: "Ember", descriptor: "A slim fox." }],
      slot_prompts: [{ slot_id: "player", prompt: "Ember from the side." }]
    };
    const settings = writeGameSetup(
      {},
      {
        design,
        design_source: "platformer\nA fox platformer",
        designer_model: { provider: "anthropic", id: "claude-x" },
        style_entity_id: "style-1",
        image_model: "fal_ai:fal-ai/flux/schnell",
        sfx_node_type: "fal.text_to_audio.ElevenLabsSoundEffectsV2",
        music_model: "replicate:meta/musicgen",
        project_name: "Ember Run"
      }
    );
    expect(readGameSetup(settings)?.design).toEqual(design);
    expect(readGameSetup(settings)?.project_name).toBe("Ember Run");
  });

  it("reads null from a malformed game bag but a write still replaces only game", () => {
    const settings = { hide_ui: true, game: { stage: 7 }, setup: { stage: "idea" } };
    expect(readGameSetup(settings)).toBeNull();
    const written = writeGameSetup(settings, { brief: "recovered" });
    expect(written["hide_ui"]).toBe(true);
    expect(readWorkflowSetup(written)).toMatchObject({ stage: "idea" });
    expect(readGameSetup(written)).toMatchObject({
      brief: "recovered",
      stage: "idea"
    });
  });
});
