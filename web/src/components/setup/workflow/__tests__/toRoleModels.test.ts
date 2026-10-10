/**
 * The model refs the Workflow host hands the build, one per model a provider
 * offers for a role.
 */
import { toRoleModels } from "../WorkflowSetupHost";

describe("toRoleModels", () => {
  // The voice select shows a voice model's first voice until one is picked,
  // so the node the build places speaks with that voice, not an empty one.
  it("gives a voice model its voices and the first one as its voice", () => {
    const [model] = toRoleModels(
      [{ id: "tts-1", provider: "openai", name: "TTS", voices: ["alloy", "nova"] }],
      "tts_model"
    );
    expect(model.ref).toMatchObject({
      type: "tts_model",
      provider: "openai",
      id: "tts-1",
      voices: ["alloy", "nova"],
      selected_voice: "alloy"
    });
  });

  it("adds no voice to a model that has none", () => {
    const [model] = toRoleModels(
      [{ id: "gpt", provider: "openai", name: "GPT" }],
      "language_model"
    );
    expect(model.ref).not.toHaveProperty("selected_voice");
    expect(model.id).toBe("openai:gpt");
  });
});
