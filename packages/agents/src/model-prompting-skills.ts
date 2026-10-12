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
 * `find_model` is how an agent reaches a guide: a matching route carries
 * `prompting_skill`, which is the step immediately before the prompt gets
 * written. None of the guides is featured, so the always-on catalog does not
 * list them; their descriptions name the model ids so that a
 * `list_skills({query})` search for a model finds its guide too.
 *
 * Matching is on the model id alone. Every provider qualifies its ids enough
 * to identify the line (`fal-ai/nano-banana-pro`, `google/nano-banana-pro/
 * text-to-image`, `nano-banana-pro`), so the provider adds nothing. A direct
 * provider that names the line its own way (`gemini-3-pro-image`,
 * `eleven_v3`, `T2V-01-Director`) needs its spelling added to the pattern.
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
    // Gemini's own API serves the same model as `gemini-3-pro-image`.
    pattern: /nano-banana-pro|gemini-3-pro-image/
  },
  {
    skill: "gpt-image-2-prompting",
    line: "GPT Image 2",
    // GPT Image 2.5 is a different release with no guide: `gpt-image-2.5`
    // on fal, AtlasCloud and OpenAI, `gpt-image-2-5-` on kie.
    pattern: /gpt-image-2(?![.\d]|-5-)/
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
    // kie spells the family `minimax-h3/…`.
    pattern: /minimax[/-]h3(?![a-z0-9.])/
  },
  {
    skill: "wan-2-6-prompting",
    line: "Wan 2.6",
    // The video routes only; AtlasCloud's Wan 2.6 image routes take a
    // different prompt.
    pattern: /wan-?2[.-]6(?!\/(?:text-to-image|image-edit))/
  },
  {
    // Kling from 2.5-turbo on: the versions with a shot list, tagged elements
    // and native audio. The alternation is what keeps 1.x, 2.0 and 2.1 out,
    // and requiring a version right after the family name is what keeps
    // `kling-image` — a different model with different rules — out too.
    skill: "kling-video-prompting",
    line: "Kling video 2.5-turbo and later",
    pattern: /kling(?:-video)?[-/]v?(?:2[.-][56]|3(?:\.0)?|o[13])(?![.\d])/
  },
  {
    // MiniMax's earlier video line. H3 is a separate guide, and no Hailuo id
    // carries `minimax/h3`, so the two never contend for the same model. The
    // direct MiniMax provider names the video-01 Director and subject models
    // `T2V-01-Director`, `I2V-01-Director` and `S2V-01`.
    skill: "hailuo-prompting",
    line: "MiniMax Hailuo",
    pattern: /hailuo|minimax\/video-01|^[ist]2v-01(?![\d])/
  },
  {
    skill: "seedream-prompting",
    line: "Seedream 4 and 5",
    pattern: /seedream[/-]v?[45](?![\d])/
  },
  {
    // The whole Qwen-Image family — text-to-image, the edit checkpoints and
    // the layered variants share one set of house rules for typography.
    skill: "qwen-image-prompting",
    line: "Qwen-Image",
    pattern: /qwen-image/
  },
  {
    // Only the endpoints that take a prompt. Scribe, dubbing, isolation and
    // voice-changer are ElevenLabs too and have nothing to prompt. The guide
    // covers v3 and the v2 family, so Eleven v4 and Music v2/v2.5 are out.
    // The direct provider's ids are `eleven_<model>`; v1 is left out.
    skill: "elevenlabs-audio-prompting",
    line: "ElevenLabs speech, dialogue, sound effects and music",
    pattern:
      /elevenlabs\/(?:tts\/(?!eleven-v4)|music(?!\/v2)|sound-effects|text-to-speech|text-to-dialogue|v3|v2-multilingual|turbo|flash)|^eleven_(?:v3|multilingual_v2|turbo_v2|flash_v2)/
  },
  {
    // 2.5 and 3. The original `fal-ai/stable-audio` is a different model.
    skill: "stable-audio-prompting",
    line: "Stable Audio",
    pattern: /stable-audio-(?:25|2\.5|3)(?![\d.])/
  }
];

/**
 * Fine-tuning endpoints (`…-trainer`, `…/trainer`) take a dataset, not a
 * prompt, so no prompting guide applies to them whatever line they train.
 */
const TRAINER = /trainer/;

/** The skill covering `modelId`, or null when no shipped guide claims it. */
export function promptingSkillFor(modelId: string): string | null {
  const id = modelId.toLowerCase();
  if (TRAINER.test(id)) return null;
  const hit = MODEL_PROMPTING_SKILLS.find((entry) => entry.pattern.test(id));
  return hit ? hit.skill : null;
}
