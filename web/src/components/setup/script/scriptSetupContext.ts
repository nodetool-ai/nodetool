/**
 * What the project composer hands a new script, beyond the prompt (F4).
 *
 * Someone attaches a reference and picks an entity, then presses Script. The
 * creation handler used to pass `prompt.trim()` and nothing else, so the flow
 * opened without the thing they had just attached. The context travels on the
 * document instead, under `setup`, and step 1 shows it.
 *
 * Only durable references travel. A local drop that exists as a `data:` URI and
 * nothing else has no id to carry, and a megabyte of base64 does not belong on
 * a document that is PATCHed on every keystroke — the composer says what stays
 * behind. An `asset://` reference is the whole attachment.
 *
 * Nothing in the flow spends these: the writer works from the brief and the
 * source. They are on the document so the editor and the agent find them where
 * the creator left them.
 *
 * Pure.
 */

import type { ScriptSetup } from "@nodetool-ai/protocol/api-schemas/scripts.js";

export interface ScriptSetupAttachment {
  /** The durable reference, `asset://<id>`. */
  uri: string;
  name: string;
  /** MIME type, when the composer knew one. */
  contentType?: string;
}

export interface ScriptSetupContext {
  attachments: ScriptSetupAttachment[];
  /** Entity library ids the creator selected. */
  entityIds: string[];
}

const ATTACHMENTS_FIELD = "attachments";
const ENTITY_IDS_FIELD = "entity_ids";

const EMPTY: ScriptSetupContext = { attachments: [], entityIds: [] };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const readAttachment = (value: unknown): ScriptSetupAttachment | null => {
  if (!isRecord(value) || typeof value.uri !== "string" || value.uri === "") {
    return null;
  }
  const attachment: ScriptSetupAttachment = {
    uri: value.uri,
    name: typeof value.name === "string" && value.name !== "" ? value.name : value.uri
  };
  if (typeof value.contentType === "string") {
    attachment.contentType = value.contentType;
  }
  return attachment;
};

/** The context a script carries, read defensively — it round-trips as unknown keys. */
export function readScriptSetupContext(
  setup: ScriptSetup | null | undefined
): ScriptSetupContext {
  if (!setup) {
    return EMPTY;
  }
  const rawAttachments = setup[ATTACHMENTS_FIELD];
  const rawEntityIds = setup[ENTITY_IDS_FIELD];
  return {
    attachments: Array.isArray(rawAttachments)
      ? rawAttachments
          .map(readAttachment)
          .filter((item): item is ScriptSetupAttachment => item !== null)
      : [],
    entityIds: Array.isArray(rawEntityIds)
      ? rawEntityIds.filter((id): id is string => typeof id === "string")
      : []
  };
}

/**
 * The setup patch that records the composer's context. Both halves are
 * optional and only written when there is something to write, so a script
 * created without either gains no field (PRD § 6.4).
 */
export function scriptSetupContextPatch(
  context: Partial<ScriptSetupContext> | undefined
): Partial<ScriptSetup> {
  const patch: Partial<ScriptSetup> = {};
  if (context?.attachments?.length) {
    patch[ATTACHMENTS_FIELD] = context.attachments;
  }
  if (context?.entityIds?.length) {
    patch[ENTITY_IDS_FIELD] = context.entityIds;
  }
  return patch;
}
