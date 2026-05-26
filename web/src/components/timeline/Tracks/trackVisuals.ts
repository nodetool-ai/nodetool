/**
 * Track / clip visual language
 *
 * Single source of truth for the track-type accents used by TrackHeader,
 * TrackLane, Clip and the index chip (V1/A1/T1/O1). Keeping this in one
 * file means the header dot, the chip prefix, and the clip tint can't drift
 * out of sync.
 */
import type { Theme } from "@mui/material/styles";
import type { TimelineTrack, TimelineClip } from "@nodetool-ai/timeline";

import VideocamOutlinedIcon from "@mui/icons-material/VideocamOutlined";
import AudiotrackOutlinedIcon from "@mui/icons-material/AudiotrackOutlined";
import LayersOutlinedIcon from "@mui/icons-material/LayersOutlined";
import SubtitlesOutlinedIcon from "@mui/icons-material/SubtitlesOutlined";
import ImageOutlinedIcon from "@mui/icons-material/ImageOutlined";
import type { SvgIconComponent } from "@mui/icons-material";

export type TrackTypeKey = TimelineTrack["type"];
export type ClipMediaKey = TimelineClip["mediaType"];

interface TrackTypeMeta {
  /** Single-letter prefix used in the index chip: V1, A1, T1, O1. */
  prefix: string;
  /** Long-form label for tooltips and aria. */
  label: string;
  Icon: SvgIconComponent;
}

const TRACK_TYPES: Record<TrackTypeKey, TrackTypeMeta> = {
  video: { prefix: "V", label: "Video", Icon: VideocamOutlinedIcon },
  audio: { prefix: "A", label: "Audio", Icon: AudiotrackOutlinedIcon },
  overlay: { prefix: "O", label: "Overlay", Icon: LayersOutlinedIcon },
  subtitle: { prefix: "T", label: "Text", Icon: SubtitlesOutlinedIcon }
};

const CLIP_MEDIA_ICONS: Record<ClipMediaKey, SvgIconComponent> = {
  video: VideocamOutlinedIcon,
  audio: AudiotrackOutlinedIcon,
  image: ImageOutlinedIcon,
  overlay: LayersOutlinedIcon
};

export function trackTypeMeta(type: TrackTypeKey): TrackTypeMeta {
  return TRACK_TYPES[type] ?? TRACK_TYPES.video;
}

export function clipMediaIcon(media: ClipMediaKey): SvgIconComponent {
  return CLIP_MEDIA_ICONS[media] ?? VideocamOutlinedIcon;
}

/** The dot/border/text accent for a track row. */
export function trackTypeAccent(theme: Theme, type: TrackTypeKey): string {
  switch (type) {
    case "video":
      return theme.vars.palette.info.main; // cyan — visible on dark canvas
    case "audio":
      return theme.vars.palette.success.main; // green — distinguishes waveform tracks
    case "overlay":
      return theme.vars.palette.secondary.main; // magenta — overlays read as "on top"
    case "subtitle":
      return theme.vars.palette.warning.main; // amber — type/captions
    default:
      return theme.vars.palette.info.main;
  }
}

/** Subtle background tint behind a clip body, scoped to track type. */
export function clipSurfaceTint(theme: Theme, type: ClipMediaKey): string {
  switch (type) {
    case "video":
      return "rgba(34, 211, 238, 0.10)"; // info / cyan, low-chroma wash
    case "audio":
      return "rgba(80, 250, 123, 0.08)"; // success / green
    case "image":
      return "rgba(34, 211, 238, 0.08)";
    case "overlay":
      return "rgba(232, 121, 249, 0.10)"; // secondary / magenta
    default:
      return "rgba(255, 255, 255, 0.04)";
  }
}

/** Subtle border tint for an unselected clip; resolves over the lane. */
export function clipBorderTint(theme: Theme, type: ClipMediaKey): string {
  switch (type) {
    case "video":
    case "image":
      return "rgba(34, 211, 238, 0.35)";
    case "audio":
      return "rgba(80, 250, 123, 0.35)";
    case "overlay":
      return "rgba(232, 121, 249, 0.40)";
    default:
      return theme.vars.palette.divider;
  }
}

/** Per-track-type index across the track list (1-based). */
export function trackIndexWithinType(
  tracks: readonly TimelineTrack[],
  trackId: string
): number {
  const target = tracks.find((t) => t.id === trackId);
  if (!target) return 1;
  let i = 0;
  for (const t of tracks) {
    if (t.type === target.type) {
      i += 1;
      if (t.id === trackId) return i;
    }
  }
  return i || 1;
}
