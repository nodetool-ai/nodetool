/**
 * Shared pieces of the three hero casts.
 *
 * They tell one session, in the order the landing page's project section
 * tells it: a sentence describes SCRAPHEART, the agent boards it and renders
 * the stills, the board animates those stills into clips, and the clips
 * become a cut. The same six shots run through all three, so a viewer who
 * watches the loop twice sees the same film assemble both times.
 *
 * Authored, not recorded — the hero reel has to re-render byte-identical on
 * any machine, with no backend and no render credits.
 */
import { PROVIDER_IDS, type LanguageModel } from "../../stores/ApiTypes";

export const HERO_MODEL: LanguageModel = {
  type: "language_model",
  id: "claude-sonnet-5",
  name: "Claude Sonnet 5",
  provider: PROVIDER_IDS.ANTHROPIC
};

/** The project, in the words the hero's first frame puts on screen. */
export const HERO_BRIEF =
  "Make me a 12-second teaser for SCRAPHEART — one last run across the flats, nothing left to lose. Board it, render it, cut it.";

export const HERO_TITLE = "SCRAPHEART — Desert Chase (Teaser)";

/**
 * The six shots, in cut order, with the pinned clip each one renders to.
 * The still for shot `i` is `STORYBOARD_STILLS[i]`; `clip` is a
 * `cast-asset://` key resolved against `demo/public/casts/promo/` by the
 * player's `resolveAssetUrl`.
 *
 * Every shot is two seconds because every pinned take is: the board's shot
 * lengths, the timeline's clips and the brief all have to agree, or the reel
 * asks for a 24-second teaser and delivers a 12-second cut on screen.
 */
export const HERO_SHOTS = [
  {
    id: "shot-1",
    slug: "The blower",
    action:
      "The supercharger spits fire down the straight, the chase car closing behind.",
    framing: "close-up",
    movement: "tracking",
    seconds: 2,
    clip: "take-blower"
  },
  {
    id: "shot-2",
    slug: "The chain",
    action: "A masked raider hauls the buggy in on a chain, sparks off the tire.",
    framing: "medium",
    movement: "tracking",
    seconds: 2,
    clip: "shot-chained"
  },
  {
    id: "shot-3",
    slug: "The rock bed",
    action: "A rear wheel churns loose rock, stones thrown at the lens.",
    framing: "close-up",
    movement: "handheld",
    seconds: 2,
    clip: "take-wheel"
  },
  {
    id: "shot-4",
    slug: "The chopper",
    action: "The rider guns the chopper flat out through the ruins.",
    framing: "wide",
    movement: "tracking",
    seconds: 2,
    clip: "take-rider"
  },
  {
    id: "shot-5",
    slug: "The cut",
    action: "A grinder throws sparks off a frame rail in the wreck yard.",
    framing: "close-up",
    movement: "static",
    seconds: 2,
    clip: "take-sparks"
  },
  {
    id: "shot-6",
    slug: "The getaway",
    action: "The car breaks loose across the dry lake and is gone.",
    framing: "wide",
    movement: "slow pull out",
    seconds: 2,
    clip: "take-drift"
  }
] as const;

/** Wall-clock anchor. Only differences matter — the tool cards show durations. */
const EPOCH = Date.parse("2026-08-24T10:00:00.000Z");

/** An ISO timestamp `ms` after the anchor. */
export const at = (ms: number): string => new Date(EPOCH + ms).toISOString();
