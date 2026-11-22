/**
 * Fonts router — migrated from REST `/api/fonts`.
 *
 * The listing is `listFontFamilies` from `@nodetool-ai/timeline/fonts/list`,
 * which the `list_fonts` agent capability calls too, so the editor and a run
 * see the same families: the bundled corpus first, tagged `portable` (D8),
 * then the system fonts.
 */

import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { listOutput as fontsListOutput } from "@nodetool-ai/protocol/api-schemas/fonts.js";
import { listFontFamilies } from "@nodetool-ai/timeline/fonts/list";

export const fontsRouter = router({
  list: protectedProcedure.output(fontsListOutput).query(async () => {
    return { fonts: listFontFamilies() };
  })
});
