import { z } from "zod";

// ── Fonts list response ──────────────────────────────────────────
// One entry per family the editor can set on a text clip.
//
// `source` is what makes the list actionable rather than decorative: a
// `bundled` family ships with NodeTool, so a document that names it renders
// identically in the editor preview, the browser export, the server render and
// the agent's frame preview. A `system` family resolves against whatever the
// machine drawing the frame has installed, which is the divergence D8 removes
// — the validator reports the same thing as `font_not_portable`.
//
// `portable` is `source === "bundled"` today. It is carried separately because
// the two answer different questions — where the face comes from, and whether
// naming it is safe — and a face served from somewhere else that is still
// pinned would break the identity, not the meaning.
export const fontEntry = z.object({
  name: z.string(),
  source: z.enum(["bundled", "system"]),
  portable: z.boolean()
});
export type FontEntry = z.infer<typeof fontEntry>;

export const listOutput = z.object({
  fonts: z.array(fontEntry)
});
export type ListOutput = z.infer<typeof listOutput>;
