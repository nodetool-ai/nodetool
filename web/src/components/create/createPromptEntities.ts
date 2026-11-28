/**
 * The picture maker's prompt keeps the references it carries as
 * `entity://<id>` tokens on a last line, which the server expands when a take
 * is generated. The text box shows only the person's words, and the chips
 * under it show the references (UX research study 24).
 */
import {
  entityIdsInPrompt,
  removeEntityMentions
} from "../node_types/editing/promptComposer/promptTokens";

const TOKEN_GAP = "\n\n";

/** The person's words and the references a stored prompt carries. */
export const splitPromptEntities = (
  prompt: string
): { text: string; entityIds: string[] } => {
  const entityIds = entityIdsInPrompt(prompt);
  if (entityIds.length === 0) {
    return { text: prompt, entityIds };
  }
  let text = entityIds.reduce(
    (current, id) => removeEntityMentions(current, id),
    prompt
  );
  if (text.endsWith(TOKEN_GAP)) {
    text = text.slice(0, -TOKEN_GAP.length);
  }
  return { text, entityIds };
};

/**
 * The stored prompt for the person's words and the references it carries.
 * The words are kept as typed, trailing spaces included, so the box can be
 * edited while it shows them.
 */
export const joinPromptEntities = (
  text: string,
  entityIds: readonly string[]
): string =>
  entityIds.length === 0
    ? text
    : `${text}${TOKEN_GAP}${entityIds.map((id) => `entity://${id}`).join(" ")}`;
