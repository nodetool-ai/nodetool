/**
 * The aspect ratios a storyboard can be shot at.
 *
 * One list, because two surfaces offer it — the board's settings form and the
 * setup flow's style step — and a board created at a ratio the settings form
 * does not offer cannot be changed back.
 */
export const ASPECT_OPTIONS = [
  { value: "16:9", label: "16:9 — Widescreen" },
  { value: "9:16", label: "9:16 — Vertical" },
  { value: "1:1", label: "1:1 — Square" },
  { value: "4:3", label: "4:3 — Classic" },
  { value: "21:9", label: "21:9 — Cinematic" }
] as const;

/** What a board is shot at unless the creator says otherwise. */
export const DEFAULT_ASPECT_RATIO = "16:9";
