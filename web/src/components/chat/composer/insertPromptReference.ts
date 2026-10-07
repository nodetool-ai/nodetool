/**
 * Splice a reference token into a prompt at the caret, with a space on each
 * side where it would otherwise run into a word. Returns the new text and the
 * caret position just past the inserted reference and its trailing space.
 */
export const insertPromptReference = (
  value: string,
  caret: number,
  reference: string
): { value: string; caret: number } => {
  const at = Math.max(0, Math.min(caret, value.length));
  const before = value.slice(0, at);
  const after = value.slice(at);
  const lead = before.length > 0 && !/\s$/.test(before) ? " " : "";
  const trail = /^\s/.test(after) ? "" : " ";
  const head = `${before}${lead}${reference}${trail}`;
  return { value: head + after, caret: head.length };
};
