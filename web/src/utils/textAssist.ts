/**
 * Prompt building for the writing assistant on a TextArea.
 *
 * The assistant rewrites one form field. It sends one `generate_text` request
 * that carries what the field is for (its label, hint, placeholder and any
 * caller context), the current text, and the instruction. The reply is the
 * new field text and nothing else.
 */

/** What the assistant knows about the field it writes. */
export interface TextAssistField {
  /** The field label, e.g. "Descriptor". */
  readonly label?: string;
  /** The hint under the field, which usually states the field's rules. */
  readonly description?: string;
  /** The placeholder, which shows the expected form of a value. */
  readonly placeholder?: string;
  /** Extra guidance from the caller, e.g. the entity kind and name. */
  readonly context?: string;
}

/** Tells the assistant which entity a descriptor describes. */
export const entityAssistContext = (kind: string, name: string): string =>
  name.trim()
    ? `The entity is a ${kind} named "${name.trim()}".`
    : `The entity is a ${kind}.`;

/** A one-click instruction in the assistant panel. */
export interface TextAssistQuickAction {
  readonly id: string;
  readonly label: string;
  readonly instruction: string;
  /** True when the action rewrites text, so it needs text to start from. */
  readonly needsText: boolean;
}

export const TEXT_ASSIST_ACTIONS: readonly TextAssistQuickAction[] = [
  {
    id: "draft",
    label: "Write it",
    instruction: "Write a complete value for this field.",
    needsText: false
  },
  {
    id: "improve",
    label: "Improve",
    instruction:
      "Make the text clearer and more specific. Keep its meaning and its facts.",
    needsText: true
  },
  {
    id: "expand",
    label: "Add detail",
    instruction: "Add concrete, specific detail that fits the field's purpose.",
    needsText: true
  },
  {
    id: "shorten",
    label: "Shorten",
    instruction: "Make the text shorter. Keep every important fact.",
    needsText: true
  },
  {
    id: "fix",
    label: "Fix grammar",
    instruction:
      "Correct spelling, grammar and punctuation only. Change nothing else.",
    needsText: true
  }
];

/** Upper bound on the reply. Form fields are short. */
export const TEXT_ASSIST_MAX_TOKENS = 2000;

export const TEXT_ASSIST_SYSTEM_PROMPT = `You write the text of one form field in a creative AI application.
Follow the instruction. Respect the field's purpose, hint and placeholder.
Keep the language of the current text, or of the placeholder when the field is empty.
Reply with the new field text only: no preamble, no explanation, no quotation marks around it, no Markdown code fence.`;

/** The user turn: the field, the current text, and the instruction. */
export const buildTextAssistPrompt = (args: {
  readonly field: TextAssistField;
  readonly text: string;
  readonly instruction: string;
}): string => {
  const { field, text, instruction } = args;
  const lines: string[] = ["# Field"];
  if (field.label) {
    lines.push(`Label: ${field.label}`);
  }
  if (field.description) {
    lines.push(`Hint: ${field.description}`);
  }
  if (field.placeholder) {
    lines.push(`Placeholder (example of the expected form): ${field.placeholder}`);
  }
  if (field.context) {
    lines.push("", "# Context", field.context);
  }
  lines.push(
    "",
    "# Current text",
    text.trim() ? text : "(empty)",
    "",
    "# Instruction",
    instruction
  );
  return lines.join("\n");
};

const FENCE = /^```[\w-]*\n([\s\S]*?)\n?```$/;
const QUOTE_PAIRS: readonly (readonly [string, string])[] = [
  ['"', '"'],
  ["“", "”"],
  ["'", "'"]
];

/**
 * The reply as field text. Models sometimes wrap the answer in a code fence
 * or in quotation marks despite the instruction, so both are removed.
 */
export const cleanTextAssistReply = (reply: string): string => {
  let text = reply.trim();
  const fenced = FENCE.exec(text);
  if (fenced) {
    text = fenced[1].trim();
  }
  for (const [open, close] of QUOTE_PAIRS) {
    if (
      text.length >= 2 &&
      text.startsWith(open) &&
      text.endsWith(close) &&
      !text.slice(1, -1).includes(close)
    ) {
      text = text.slice(1, -1).trim();
      break;
    }
  }
  return text;
};
