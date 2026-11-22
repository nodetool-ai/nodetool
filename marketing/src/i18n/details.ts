/**
 * Translated detail pages: /<locale>/storyboards/<slug>, /<locale>/recipes/<slug>
 * and /<locale>/ad-library/<slug>.
 *
 * A detail page renders the same component as its English page, fed an entry
 * whose visible text is swapped for the translation. The `*Text` functions
 * below pick that visible text out of an English entry. A translation file
 * holds exactly that shape per slug, and `localize` lays it over the entry.
 * `tests/e2e/zh-pages.spec.ts` checks that every translation still has the
 * shape of its English source, so a new shot, beat or step fails the test
 * until it is translated.
 *
 * Kept in English on purpose: model, product and app names, and a recipe's
 * example brief, which is the English prompt the recorded run used.
 */
import type { Storyboard } from "@/data/storyboards";
import type { AdRecipe } from "@/data/adLibrary";
import type { RecipeEntry } from "@/data/recipes";

export function storyboardText(board: Storyboard) {
  return {
    title: board.title,
    description: board.description,
    brief: board.brief,
    style: board.style,
    shots: board.shots.map((shot) => ({
      title: shot.title,
      action: shot.action,
      framing: shot.framing,
      movement: shot.movement,
    })),
  };
}

export function adText(ad: AdRecipe) {
  return {
    title: ad.title,
    objective: ad.objective,
    assets_required: ad.assets_required,
    layer_stack_bottom_to_top: ad.layer_stack_bottom_to_top,
    visual_invariant: ad.visual_invariant,
    format_adaptations: ad.format_adaptations,
    beats: ad.beats.map((beat) => ({
      composition: beat.composition,
      motion: beat.motion,
      audio_cue: beat.audio_cue,
      qa: beat.qa,
    })),
    fallback: ad.fallback,
    watch_out: ad.watch_out,
    variants: ad.variants,
    selection: {
      use_when: ad.selection.use_when,
      avoid_when: ad.selection.avoid_when,
      motion_principle: ad.selection.motion_principle,
    },
    acceptance_criteria: ad.acceptance_criteria,
  };
}

export function recipeText(recipe: RecipeEntry) {
  const run = recipe.productionRun;
  return {
    name: recipe.name,
    outcome: recipe.outcome,
    productionRun: run
      ? {
          proofTitle: run.proofTitle,
          summary: run.summary,
          provider: run.provider,
          hero: { alt: run.hero.alt },
          card: { alt: run.card.alt },
          proof: run.proof ? { alt: run.proof.alt, ...(run.proof.caption ? { caption: run.proof.caption } : {}) } : null,
          video: run.video ? { caption: run.video.caption } : null,
        }
      : null,
    guide: {
      stages: recipe.guide.stages,
      introduction: recipe.guide.introduction,
      inputs: recipe.guide.inputs,
      note: recipe.guide.note,
      steps: recipe.guide.steps.map((step) => ({
        phase: step.phase,
        stage: step.stage,
        title: step.title,
        description: step.description,
        action: step.action,
        ...(step.image ? { image: { alt: step.image.alt } } : {}),
      })),
    },
  };
}

export type StoryboardText = ReturnType<typeof storyboardText>;
export type AdText = ReturnType<typeof adText>;
export type RecipeText = ReturnType<typeof recipeText>;

/**
 * Lay translated text over an entry. Objects merge key by key, arrays item by
 * item, and strings replace. Everything the translation leaves out, such as
 * media and timing, stays as it is.
 */
export function localize<T>(entry: T, text: unknown): T {
  if (text === null || text === undefined) return entry;
  if (typeof text === "string") return text as T;
  if (Array.isArray(text)) {
    if (!Array.isArray(entry)) return entry;
    return entry.map((item, index) => localize(item, text[index])) as T;
  }
  if (typeof text === "object" && entry && typeof entry === "object") {
    const out: Record<string, unknown> = { ...(entry as Record<string, unknown>) };
    for (const [key, value] of Object.entries(text as Record<string, unknown>)) {
      out[key] = localize(out[key], value);
    }
    return out as T;
  }
  return entry;
}

/** The keys and array lengths of a value, with strings reduced to "". */
export function textShape(value: unknown): unknown {
  if (typeof value === "string") return "";
  if (Array.isArray(value)) return value.map(textShape);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, textShape(item)])
    );
  }
  return value;
}
