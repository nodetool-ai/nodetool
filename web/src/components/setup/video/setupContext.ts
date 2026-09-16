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
import {
  readCreativeContext,
  type CreativeContext,
  type ProductionReference
} from "../../../hooks/storyboard/productionContext";
export type { CreativeContext } from "../../../hooks/storyboard/productionContext";

/**
 * A reference image the composer was holding when the card was clicked.
 *
 * A durable locator only. Inline bytes would put a data URI into the
 * document, its autosave and its version history, so a caller that has a
 * local file uploads it first and passes the asset it got back.
 */
export interface VideoSetupReference extends ProductionReference {
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
  /** Optional product, audience, objective and claims context. */
  creativeContext?: CreativeContext;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isReference = (value: unknown): value is VideoSetupReference => {
  if (!isRecord(value)) {
    return false;
  }
  return typeof value.uri === "string";
};

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
): {
  references: VideoSetupReference[];
  entityIds: string[];
  creativeContext?: CreativeContext;
} => {
  const fields = isRecord(setup) ? setup : {};
  const references = fields["references"];
  const entityIds = fields["entityIds"];
  const creativeContext = readCreativeContext(
    fields["creative_context"] ?? fields["creativeContext"]
  );
  const result: {
    references: VideoSetupReference[];
    entityIds: string[];
    creativeContext?: CreativeContext;
  } = {
    references: Array.isArray(references) ? references.filter(isReference) : [],
    entityIds: Array.isArray(entityIds)
      ? entityIds.filter((id): id is string => typeof id === "string")
      : []
  };
  if (creativeContext) {
    result.creativeContext = creativeContext;
  }
  return result;
};

/** The composer's context on the open sequence, for the step that shows it. */
export const useVideoSetupContext = (): {
  references: VideoSetupReference[];
  entityIds: string[];
  creativeContext?: CreativeContext;
} => {
  const setup = useTimelineStore((state) => state.setup);
  return useMemo(() => readVideoSetupContext(setup), [setup]);
};
