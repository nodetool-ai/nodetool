/**
 * The persisted storyboard payload, as this package sees it.
 *
 * The authoritative declaration is `StoryboardDocument` in
 * `@nodetool-ai/models`, which this package cannot import: models sits above
 * runtime in the build order and this one sits directly on protocol + timeline
 * (design §3.1). The two declarations are structurally identical, so a models
 * document is passed straight in and a derived document straight back out; a
 * field added there without being added here fails the caller's assignment
 * rather than going missing quietly.
 */

import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import type { StoryboardSetupStage } from "@nodetool-ai/protocol/api-schemas/storyboards.js";

export interface StoryboardDocument {
  screenplay: Screenplay | null;
  shots: Shot[];
  brief: string;
  style: string;
  /** Library entity (asset) ids applied to the board's shot prompts. */
  entityIds: string[];
  aspectRatio: string;
  setupStage: StoryboardSetupStage;
  genre: string;
  directorModel: Record<string, unknown> | null;
  imageModel: Record<string, unknown> | null;
  videoModel: Record<string, unknown> | null;
  /** The board this one was recast from (design §2.1). */
  templateId?: string | null;
  /** The canonical substitution mapping that produced this copy. */
  recastKey?: string | null;
}
