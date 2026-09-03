/**
 * Which shipped prompting skill covers a model line.
 *
 * A generation model line has house rules — Seedance wants a sound brief,
 * GPT Image wants five labelled slots, MiniMax H3 wants a job assigned to
 * every reference — and a model that writes the same prompt for all of them
 * gets the blandest reading each one has. The skills in
 * `packages/system-skills` carry those rules; this table is what points at the
 * right one before the prompt is written rather than after the render comes
 * back wrong.
 *
 * Two paths reach the same skill. The always-on skill catalog names the model
 * ids in each description, so an agent that already knows its model can call
 * `load_skill` unprompted. `find_model` is the mechanical path: a matching
 * route carries `prompting_skill`, which is the step immediately before the
 * prompt gets written.
 *
 * Matching is on the model id alone. Every provider qualifies its ids enough
 * to identify the line (`fal-ai/nano-banana-pro`, `google/nano-banana-pro/
 * text-to-image`, `nano-banana-pro`), so the provider adds nothing and a new
 * provider serving the same line is covered with no change here.
 */

/** One model line and the skill that teaches it. */
export interface ModelPromptingSkill {
  /** The system skill's name, as `load_skill` takes it. */
  readonly skill: string;
  /** The line, spelled the way a person says it. */
  readonly line: string;
  /** Matched against a lowercased model id. */
  readonly pattern: RegExp;
}

/**
 * The lines with a shipped guide, in the order a tie would be resolved. No two
 * patterns overlap today; the order is fixed so that if two ever do, which one
 * wins is a property of this list and not of object iteration.
 *
 * Each pattern is deliberately narrow at the version boundary. The Nano Banana
 * Pro guide is not the Nano Banana 2 guide, and `gpt-image-2` must not answer
 * for `gpt-image-1.5`, so a lookahead blocks the digit and the dot that would
 * make a future version inherit an older line's rules by accident.
 */
export const MODEL_PROMPTING_SKILLS: readonly ModelPromptingSkill[] = [
  {
    skill: "nano-banana-pro-prompting",
    line: "Nano Banana Pro",
    pattern: /nano-banana-pro/
  },
  {
    skill: "gpt-image-2-prompting",
    line: "GPT Image 2",
    pattern: /gpt-image-2(?![.\d])/
  },
  {
    skill: "flux-2-klein-prompting",
    line: "FLUX.2 [klein]",
    pattern: /flux-2[/-]klein/
  },
  {
    skill: "seedance-2-prompting",
    line: "Seedance 2",
    pattern: /seedance-2(?!\d)/
  },
  {
    skill: "veo-3-prompting",
    line: "Veo 3",
    pattern: /veo-?3(?!\d)/
  },
  {
    skill: "minimax-h3-prompting",
    line: "MiniMax H3",
    pattern: /minimax\/h3(?![a-z0-9])/
  },
  {
    skill: "wan-2-6-prompting",
    line: "Wan 2.6",
    pattern: /wan-?2[.-]6/
  }
];

/** The skill covering `modelId`, or null when no shipped guide claims it. */
export function promptingSkillFor(modelId: string): string | null {
  const id = modelId.toLowerCase();
  const hit = MODEL_PROMPTING_SKILLS.find((entry) => entry.pattern.test(id));
  return hit ? hit.skill : null;
}
