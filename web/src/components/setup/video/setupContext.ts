/**
 * What the New Project composer was holding when the entry card was clicked,
 * carried onto the sequence the flow creates (F4, PRD § 6.4).
 *
 * Both fields are optional and additive. `timelineSetup` is a passthrough
 * schema, so they travel through the editor, autosave and version history
 * without the protocol package knowing about them, and a sequence that has
 * neither opens exactly as it did before they existed.
 */

import { useMemo } from "react";

import { useTimelineStore } from "../../../stores/timeline/TimelineStore";

/**
 * A reference image the composer was holding when the card was clicked.
 *
 * A durable locator only. Inline bytes would put a data URI into the
 * document, its autosave and its version history, so a caller that has a
 * local file uploads it first and passes the asset it got back.
 */
export interface VideoSetupReference {
  /** `asset://<id>.<ext>`. */
  uri: string;
  /** The file's name, for the list on step 1. */
  name?: string;
}

/**
 * What the New Project composer had beside the prompt (F4). Both fields are
 * optional and additive, per PRD § 6.4: a sequence created without them is
 * byte-identical to one created before they existed.
 */
export interface VideoSetupContext {
  references?: readonly VideoSetupReference[];
  /** Entities the creator picked in the composer. */
  entityIds?: readonly string[];
}

const isReference = (value: unknown): value is VideoSetupReference =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { uri?: unknown }).uri === "string";

/**
 * Read the composer's context back off a sequence.
 *
 * `timelineSetup` is a passthrough schema, so the two fields travel through
 * the editor, autosave and version history untouched without the protocol
 * package knowing about them — and a sequence that has neither reads as empty
 * rather than as malformed.
 */
export const readVideoSetupContext = (
  setup: unknown
): { references: VideoSetupReference[]; entityIds: string[] } => {
  const fields =
    typeof setup === "object" && setup !== null
      ? (setup as Record<string, unknown>)
      : {};
  const references = fields["references"];
  const entityIds = fields["entityIds"];
  return {
    references: Array.isArray(references) ? references.filter(isReference) : [],
    entityIds: Array.isArray(entityIds)
      ? entityIds.filter((id): id is string => typeof id === "string")
      : []
  };
};

/** The composer's context on the open sequence, for the step that shows it. */
export const useVideoSetupContext = (): {
  references: VideoSetupReference[];
  entityIds: string[];
} => {
  const setup = useTimelineStore((state) => state.setup);
  return useMemo(() => readVideoSetupContext(setup), [setup]);
};

