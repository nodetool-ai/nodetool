/**
 * Browser-extension router — status for the install helper UI.
 *
 * `connected` reflects whether a native host is accepting connections, which
 * means the extension is running and reached its host. `distPath` lets the UI
 * reveal/copy the build location.
 */

import { z } from "zod";
import { router, publicProcedure } from "../index.js";
import { isBridgeAvailable } from "@nodetool-ai/browser";
import { resolveExtensionDist } from "../../lib/extension-dist.js";

export const extensionRouter = router({
  status: publicProcedure
    .output(
      z.object({
        connected: z.boolean(),
        distPath: z.string(),
        distExists: z.boolean()
      })
    )
    .query(async () => {
      const dist = resolveExtensionDist();
      return {
        connected: await isBridgeAvailable(),
        distPath: dist.path,
        distExists: dist.exists
      };
    })
});
