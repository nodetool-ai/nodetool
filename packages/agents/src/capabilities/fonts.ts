/**
 * The `fonts` capability module — the families a timeline text clip can name.
 *
 * Calls `listFontFamilies` from `@nodetool-ai/timeline/fonts/list`, the
 * listing the tRPC `fonts.list` procedure returns to the editor, so a run
 * and the font picker offer the same families in the same order.
 */

import type { CapabilityExport, CapabilityModule } from "./types.js";
import { listFontsSpec } from "./fonts.specs.js";

const listFonts: CapabilityExport = {
  spec: listFontsSpec,
  impl: async (_run, params) => {
    const { listFontFamilies } = await import("@nodetool-ai/timeline/fonts/list");
    const fonts =
      params["portable_only"] === true
        ? listFontFamilies([])
        : listFontFamilies();
    return { fonts };
  }
};

export const FONT_CAPABILITIES: readonly CapabilityExport[] = [listFonts];

export const module: CapabilityModule = {
  module: "fonts",
  exports: FONT_CAPABILITIES
};

export { listFonts };
