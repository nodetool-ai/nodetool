/**
 * Browser-extension router — status for the install helper UI.
 *
 * `connected` reflects whether a native host is accepting connections, which
 * means the extension is running and reached its host. `distPath` lets the UI
 * reveal/copy the build location; the cloud profile leaves it empty.
 */

import { z } from "zod";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { isBridgeAvailable } from "@nodetool-ai/browser";
import { resolveExtensionDist } from "../../lib/extension-dist.js";
import { isCloudProfile } from "../../lib/cloud-profile.js";

export const extensionRouter = router({
  status: protectedProcedure
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
        // A host path means nothing to a cloud user and names the operator's
        // install layout.
        distPath: isCloudProfile() ? "" : dist.path,
        distExists: dist.exists
      };
    })
});
