/**
 * Browser-extension router — status for the install helper UI.
 *
 * `connected` reflects whether the Chrome extension currently has a live
 * `/ws/extension` socket (i.e. the user installed it and it reached the
 * server). `distPath` lets the UI reveal/copy the build location.
 */

import { z } from "zod";
import { router, publicProcedure } from "../index.js";
import { extensionBridge } from "../../extension-cdp-bridge.js";
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
    .query(() => {
      const dist = resolveExtensionDist();
      return {
        connected: extensionBridge.connected,
        distPath: dist.path,
        distExists: dist.exists
      };
    })
});
