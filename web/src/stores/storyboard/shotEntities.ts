/**
 * Which board entities apply to a shot. The rule lives in
 * `@nodetool-ai/protocol` so the editor's generation path (useGenerateShot),
 * the UI (ShotCard's entity chips), and the server-side storyboard render
 * tools all season prompts with the same set.
 */

export { entitiesForShot } from "@nodetool-ai/protocol";
