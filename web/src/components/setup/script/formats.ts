/**
 * Step 2's format cards and the length row beneath them (PRD § 9.2).
 *
 * The formats themselves — what each one does to the cast and to the section
 * layout — live in `@nodetool-ai/protocol`, because the writer needs the same
 * table whether it runs here or headlessly. This file is only the card copy:
 * the cast shape, which is what a creator is actually choosing between, is put
 * on the card so "Interview" and "Dialogue" read as different decisions rather
 * than as two words for talking.
 */

import { SCRIPT_FORMATS, SCRIPT_LENGTH_CHOICES } from "@nodetool-ai/protocol";
import type { ScriptFormat } from "@nodetool-ai/protocol";

import type { OptionCardItem } from "../OptionCardGrid";

/** How each format's cast reads on its card. */
const CAST_LINE: Readonly<Record<ScriptFormat["castShape"], string>> = {
  narrator: "One voice",
  characters: "Two or more named speakers",
  "host-and-guest": "A host and a guest"
};

export const FORMAT_CARDS: readonly OptionCardItem[] = SCRIPT_FORMATS.map(
  (format) => ({
    id: format.id,
    title: format.label,
    description: `${format.description} ${CAST_LINE[format.castShape]}.`
  })
);

export interface LengthChoice {
  id: string;
  label: string;
  seconds: number;
}

/** The lengths offered under the cards. `custom` is the flow's own entry. */
export const LENGTH_CHOICES: readonly LengthChoice[] = SCRIPT_LENGTH_CHOICES.map(
  (seconds) => ({
    id: `${seconds}`,
    label: seconds < 60 ? `${seconds}s` : `${seconds / 60} min`,
    seconds
  })
);

/** The length the format step starts on when nothing was chosen yet. */
export const DEFAULT_LENGTH_SECONDS = 60;
