/**
 * Figma Weave's published pricing, transcribed from the page named below.
 *
 * This is the one price table on the site that is not generated from the
 * repo, because it is somebody else's product. It is written down instead —
 * with the URL and the date it was read — so a reader can check it and a
 * maintainer knows when it went stale. Weave changes its plans; when it does,
 * re-read the page and update `READ_ON` in the same edit.
 *
 * Nothing here is interpreted. The plan prices and the per-model generation
 * counts are Weave's own figures; the cost of a workload is derived from them
 * in `weaveMonthlyCost` rather than restated as a rate.
 */

export const WEAVE_SOURCE = {
  name: "Figma Weave",
  url: "https://weave.figma.com/pricing",
  /** The day the table below was read off that page. */
  readOn: "2026-08-24",
};

export type WeavePlanId = "free" | "starter" | "professional" | "team";

export interface WeavePlan {
  id: WeavePlanId;
  name: string;
  /** USD per month on the monthly term. Team is per user. */
  monthlyUsd: number;
  /** USD per year on the annual term, when the page lists one. */
  annualUsd: number | null;
  creditsPerMonth: number;
  perUser: boolean;
  /** Top-up price beyond the monthly allowance. Free plans cannot top up. */
  topup: { usd: number; credits: number } | null;
}

export const WEAVE_PLANS: WeavePlan[] = [
  {
    id: "free",
    name: "Free",
    monthlyUsd: 0,
    annualUsd: null,
    creditsPerMonth: 150,
    perUser: false,
    topup: null,
  },
  {
    id: "starter",
    name: "Starter",
    monthlyUsd: 24,
    annualUsd: 228,
    creditsPerMonth: 1500,
    perUser: false,
    topup: { usd: 10, credits: 1000 },
  },
  {
    id: "professional",
    name: "Professional",
    monthlyUsd: 45,
    annualUsd: 432,
    creditsPerMonth: 4000,
    perUser: false,
    topup: { usd: 10, credits: 1200 },
  },
  {
    id: "team",
    name: "Team",
    monthlyUsd: 60,
    annualUsd: 576,
    creditsPerMonth: 4500,
    perUser: true,
    topup: { usd: 10, credits: 1200 },
  },
];

export type WeaveModelKind = "image" | "video" | "3d";

export interface WeaveModel {
  name: string;
  kind: WeaveModelKind;
  /**
   * Generations the plan's monthly credits buy, as the page's table lists
   * them. `null` is a dash — the model is not offered on that plan.
   */
  generations: Record<WeavePlanId, number | null>;
}

export const WEAVE_MODELS: WeaveModel[] = [
  { name: "Flux Fast", kind: "image", generations: { free: 375, starter: 3750, professional: 10000, team: 11250 } },
  { name: "Flux 2 Pro", kind: "image", generations: { free: 30, starter: 300, professional: 800, team: 900 } },
  { name: "Nano Banana 2", kind: "image", generations: { free: 25, starter: 251, professional: 667, team: 751 } },
  { name: "Nano Banana Pro", kind: "image", generations: { free: 13, starter: 133, professional: 356, team: 400 } },
  { name: "GPT Image 1.5", kind: "image", generations: { free: 21, starter: 214, professional: 571, team: 643 } },
  { name: "Seedream V5", kind: "image", generations: { free: 38, starter: 375, professional: 1000, team: 1125 } },
  { name: "Recraft V4", kind: "image", generations: { free: 17, starter: 167, professional: 444, team: 500 } },
  { name: "Mystic", kind: "image", generations: { free: 13, starter: 125, professional: 333, team: 375 } },
  { name: "Qwen Multiangle", kind: "image", generations: { free: 38, starter: 375, professional: 1000, team: 1125 } },
  { name: "Topaz Upscale", kind: "image", generations: { free: 8, starter: 79, professional: 211, team: 237 } },
  { name: "Kling 3", kind: "video", generations: { free: null, starter: 15, professional: 40, team: 45 } },
  { name: "Kling Motion Control", kind: "video", generations: { free: null, starter: 10, professional: 27, team: 30 } },
  { name: "Kling O1", kind: "video", generations: { free: null, starter: 14, professional: 36, team: 41 } },
  { name: "Veo 3.1", kind: "video", generations: { free: null, starter: 17, professional: 44, team: 51 } },
  { name: "Seedance 1.5", kind: "video", generations: { free: null, starter: 48, professional: 129, team: 145 } },
  { name: "Runway Gen-4.5", kind: "video", generations: { free: null, starter: 21, professional: 57, team: 64 } },
  { name: "Grok Imagine", kind: "video", generations: { free: null, starter: 42, professional: 111, team: 125 } },
  { name: "Wan 2.5", kind: "video", generations: { free: null, starter: 27, professional: 73, team: 82 } },
  { name: "Wan Animate", kind: "video", generations: { free: null, starter: 15, professional: 40, team: 45 } },
  { name: "Luma Ray 2", kind: "video", generations: { free: null, starter: 14, professional: 37, team: 42 } },
  { name: "LTX 2", kind: "video", generations: { free: null, starter: 15, professional: 40, team: 45 } },
  { name: "Hunyuan 3D V3", kind: "3d", generations: { free: 1, starter: 19, professional: 50, team: 56 } },
  { name: "Rodin V2", kind: "3d", generations: { free: 4, starter: 42, professional: 111, team: 125 } },
];

/**
 * Weave prices a video model per generation, not per second, and does not
 * publish how long a generation is. Its own headline — 1,500 credits as
 * "417 sec video" — works out at roughly eight seconds per generation on the
 * cheaper video models, which is also the clip length most of them default
 * to. The calculator says so and lets the reader change it.
 */
export const WEAVE_DEFAULT_CLIP_SECONDS = 8;

/**
 * Credits one generation of `model` costs on `plan`, derived from the
 * published table rather than restated: the plan's credits divided by the
 * generations it says they buy. `null` when the plan does not offer it.
 */
export function creditsPerGeneration(
  model: WeaveModel,
  plan: WeavePlan
): number | null {
  const generations = model.generations[plan.id];
  if (!generations) return null;
  return plan.creditsPerMonth / generations;
}

export interface WeaveCost {
  /** What the month costs: the plan, plus any top-ups the workload forces. */
  totalUsd: number;
  planUsd: number;
  topupUsd: number;
  creditsNeeded: number;
  creditsIncluded: number;
  /** True when the plan does not offer one of the chosen models at all. */
  unavailable: boolean;
}

/**
 * What a month of `images` and `clips` costs on a Weave plan.
 *
 * Over the allowance the plan's own top-up rate applies, bought in whole
 * blocks — which is how it is sold. A plan with no top-up (Free) cannot
 * absorb the overflow, so the workload simply does not fit.
 */
export function weaveMonthlyCost({
  plan,
  imageModel,
  images,
  videoModel,
  clips,
}: {
  plan: WeavePlan;
  imageModel: WeaveModel;
  images: number;
  videoModel: WeaveModel;
  clips: number;
}): WeaveCost {
  const perImage = creditsPerGeneration(imageModel, plan);
  const perClip = creditsPerGeneration(videoModel, plan);
  const unavailable =
    (images > 0 && perImage === null) || (clips > 0 && perClip === null);

  const creditsNeeded =
    (perImage ?? 0) * images + (perClip ?? 0) * clips;
  const creditsIncluded = plan.creditsPerMonth;
  const over = Math.max(0, creditsNeeded - creditsIncluded);

  let topupUsd = 0;
  if (over > 0 && plan.topup) {
    topupUsd = Math.ceil(over / plan.topup.credits) * plan.topup.usd;
  }

  return {
    totalUsd: plan.monthlyUsd + topupUsd,
    planUsd: plan.monthlyUsd,
    topupUsd,
    creditsNeeded,
    creditsIncluded,
    unavailable: unavailable || (over > 0 && !plan.topup),
  };
}
