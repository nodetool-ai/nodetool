/**
 * "Add your own style" — reference images to a user-owned style entity
 * (PRD § 7.3, § 7.7.9).
 *
 * A shipped preset is a system row every user reads, so this never edits one:
 * the descriptor the model writes from the references becomes a *new* entity
 * owned by the creator, and a preset the board happened to be on only supplies
 * a fallback name. That is the whole of § 7.7.9's rule, and the reason these
 * builders take their inputs read-only and return fresh objects.
 *
 * Pure: no store, no DOM, no fetch.
 */

import type { MessageContent } from "@nodetool-ai/protocol";

/** How many references the step accepts (PRD § 7.3). */
export const MAX_STYLE_REFERENCES = 3;

export const STYLE_DESCRIPTOR_TOOL_NAME = "art_style";
export const STYLE_DESCRIPTOR_TOOL_DESCRIPTION =
  "A name and a prompt-ready descriptor for the art style of the references.";

export const STYLE_DESCRIPTOR_SYSTEM_PROMPT =
  "You describe the look of images so an image model can reproduce it. Write " +
  "about medium, line, colour, light and texture. Never describe the subject, " +
  "the people or the place — only how the picture is made.";

/** The instruction that rides with the reference images. */
export const STYLE_DESCRIPTOR_PROMPT =
  "Describe the shared art style of these references in two or three " +
  "sentences, as a descriptor that will be pasted into every image prompt. " +
  "Give it a short name of at most four words.";

/** Structured output: the two fields the entity needs. */
export const STYLE_DESCRIPTOR_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    name: { type: "string", description: "Short name, at most four words." },
    descriptor: {
      type: "string",
      description: "The look itself, pasted verbatim into image prompts."
    }
  },
  required: ["name", "descriptor"]
};

/** The prompt plus one image block per reference, as one user message. */
export function buildStyleDescriptorContent(
  imageUris: readonly string[]
): MessageContent[] {
  return [
    { type: "text", text: STYLE_DESCRIPTOR_PROMPT },
    ...imageUris.slice(0, MAX_STYLE_REFERENCES).map(
      (uri): MessageContent => ({
        type: "image_url",
        image: { type: "image", uri }
      })
    )
  ];
}

/** A style the board is already on — read for its name, never written. */
export interface StyleSource {
  name: string;
  descriptor: string;
}

export interface UserStyleDraft {
  name: string;
  descriptor: string;
}

const DEFAULT_STYLE_NAME = "My style";

/**
 * The entity the flow saves. `basedOn` is the preset the board was showing
 * when the creator pressed `Add your own style`: it names the copy when the
 * model gave no name, and is otherwise untouched — a preset's descriptor never
 * changes under a user (§ 7.7.9).
 */
export function buildUserStyle(
  answer: { name?: string; descriptor?: string },
  basedOn?: StyleSource | null
): UserStyleDraft | null {
  const descriptor = (answer.descriptor ?? "").trim();
  if (descriptor === "") {
    return null;
  }
  const name = (answer.name ?? "").trim();
  return {
    name:
      name !== ""
        ? name
        : basedOn?.name
          ? `${basedOn.name} (yours)`
          : DEFAULT_STYLE_NAME,
    descriptor
  };
}

export default buildUserStyle;
