import type { EntityKind, Screenplay } from "@nodetool-ai/protocol";
import { isObjectLike, isString } from "../../../utils/typePredicates";

export interface EntitySuggestion {
  readonly name: string;
  readonly kind: Exclude<EntityKind, "style">;
  readonly descriptor: string;
  readonly referencePrompt: string;
}

export const ENTITY_SUGGESTIONS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["entities"],
  properties: {
    entities: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "kind", "descriptor", "reference_prompt"],
        properties: {
          name: { type: "string" },
          kind: { type: "string", enum: ["character", "location", "prop"] },
          descriptor: { type: "string" },
          reference_prompt: { type: "string" }
        }
      }
    }
  }
} as const;

export const ENTITY_SUGGESTIONS_SYSTEM_PROMPT = [
  "You are casting a storyboard from its finished screenplay.",
  "Return only recurring or visually important characters, locations, and props that need consistent reference images.",
  "Do not return styles, generic objects, crowds, or one-off background details.",
  "The descriptor contains stable visual traits only.",
  "The reference prompt must request one clear, centered subject on a simple neutral background, with no text or collage."
].join(" ");

export const buildEntitySuggestionsPrompt = (screenplay: Screenplay): string => {
  const scenes = (screenplay.scenes ?? [])
    .map((scene) => `${scene.slugline}${scene.lighting ? ` — ${scene.lighting}` : ""}`)
    .join("\n");
  const shots = screenplay.shots
    .map(
      (shot) =>
        `${shot.index + 1}. ${shot.slug ?? "Shot"}: ${shot.action}${
          shot.dialogue ? ` Dialogue: ${shot.dialogue}` : ""
        }`
    )
    .join("\n");
  return [
    `Title: ${screenplay.title}`,
    screenplay.logline ? `Logline: ${screenplay.logline}` : "",
    scenes ? `Scenes:\n${scenes}` : "",
    `Shots:\n${shots}`
  ]
    .filter(Boolean)
    .join("\n\n");
};

const isSuggestionKind = (
  value: unknown
): value is EntitySuggestion["kind"] =>
  value === "character" || value === "location" || value === "prop";

export const parseEntitySuggestions = (value: unknown): EntitySuggestion[] => {
  if (!isObjectLike(value) || !Array.isArray(value.entities)) {
    return [];
  }
  return value.entities.flatMap((candidate) => {
    if (!isObjectLike(candidate) || !isSuggestionKind(candidate.kind)) {
      return [];
    }
    const name = isString(candidate.name) ? candidate.name.trim() : "";
    const descriptor = isString(candidate.descriptor)
      ? candidate.descriptor.trim()
      : "";
    const referencePrompt = isString(candidate.reference_prompt)
      ? candidate.reference_prompt.trim()
      : "";
    return name && descriptor && referencePrompt
      ? [{ name, kind: candidate.kind, descriptor, referencePrompt }]
      : [];
  });
};
