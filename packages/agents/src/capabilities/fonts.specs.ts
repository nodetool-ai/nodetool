/**
 * The `fonts` module's specs — data only, no implementation.
 *
 * Split out so a belt can be assembled synchronously: the registry's eager
 * spec table imports this file, never `fonts.ts`, so nothing the
 * implementation pulls in reaches the entry graph.
 */

import type { CapabilitySpec } from "./types.js";

export const listFontsSpec: CapabilitySpec = {
  name: "list_fonts",
  description:
    "List the font families a timeline text clip can name, the same list " +
    "the editor's font picker shows. Bundled families come first and are " +
    "portable: a document that names one renders the same everywhere. A " +
    "system family is installed on this machine only, so another host may " +
    "draw it differently and timeline validation reports it as " +
    "font_not_portable. Prefer a portable family.",
  inputSchema: {
    type: "object",
    properties: {
      portable_only: {
        type: "boolean",
        description: "Only the bundled, portable families.",
        default: false
      }
    },
    additionalProperties: false
  },
  category: "read",
  userMessage: () => "Listing fonts"
};

/** Every spec this module declares, in declaration order. */
export const fontsSpecs: readonly CapabilitySpec[] = [listFontsSpec];
