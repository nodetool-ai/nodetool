import {
  applyAutoCrossfade,
  autoCrossfadeMsOf,
  effectiveAssetId,
  harmonizeClips,
  previewTake
} from "@nodetool-ai/timeline";
import type { HarmonyDocument, TimelineClip } from "@nodetool-ai/timeline";
import type { TimelineAudition } from "../../../stores/timeline/TimelineUIStore";

/**
 * The clips as the audio graph should hear them. Auditioning a take swaps its
 * media into the clip for preview only, the same projection the picture uses
 * in `PreviewCompositor`, so a Preview Candidate on an audio take is heard.
 */
export function auditionedClips(
  clips: TimelineClip[],
  audition: TimelineAudition | null,
  doc: HarmonyDocument & { music?: { autoCrossfadeMs?: number } }
): TimelineClip[] {
  // A midi clip with `harmony` sounds its arp or comp expansion.
  const harmonized = harmonizeClips(clips, doc);
  // The audition swaps a take's media into its clip first, so a clip that
  // only becomes playable through it is a cut to smooth like any other.
  const target = audition
    ? harmonized.find((clip) => clip.id === audition.clipId)
    : undefined;
  const preview = target && audition ? previewTake(target, audition.takeId) : null;
  const heard = preview
    ? harmonized.map((clip) => (clip.id === preview.id ? preview : clip))
    : harmonized;
  // A music project crossfades touching audio clips (CE7). Only a clip that
  // sounds takes part, as in the browser and server exports: a muted, hidden
  // or assetless neighbour is not a cut to smooth.
  const sounding = heard.filter(
    (clip) =>
      clip.mediaType === "audio" &&
      !clip.muted &&
      !clip.hidden &&
      effectiveAssetId(clip) !== undefined
  );
  const faded = applyAutoCrossfade(sounding, autoCrossfadeMsOf(doc));
  const fadedById = new Map(faded.map((clip) => [clip.id, clip]));
  return heard.map((clip) => fadedById.get(clip.id) ?? clip);
}
