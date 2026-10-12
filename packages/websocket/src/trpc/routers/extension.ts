/**
 * Browser-extension router — status and setup for the install helper UI.
 *
 * `connected` reflects whether a native host is accepting connections, which
 * means the extension is running and reached its host. `hostInstalled` says
 * whether a browser on this machine has the host registered, which Chrome
 * needs before the extension can reach it. `distPath` lets the UI
 * reveal/copy the build location; the cloud profile leaves it empty.
 *
 * `installHost` registers the host from the app, so the user never runs
 * `nodetool extension install`. It writes to this machine's browser profiles,
 * so the cloud profile refuses it.
 */

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  installNativeHost,
  isBridgeAvailable,
  isNativeHostInstalled
} from "@nodetool-ai/browser";
import { resolveExtensionDist } from "../../lib/extension-dist.js";
import { isCloudProfile } from "../../lib/cloud-profile.js";

export const extensionRouter = router({
  status: protectedProcedure
    .output(
      z.object({
        connected: z.boolean(),
        hostInstalled: z.boolean(),
        distPath: z.string(),
        distExists: z.boolean()
      })
    )
    .query(async () => {
      const dist = resolveExtensionDist();
      const cloud = isCloudProfile();
      return {
        connected: await isBridgeAvailable(),
        hostInstalled: !cloud && isNativeHostInstalled(),
        // A host path means nothing to a cloud user and names the operator's
        // install layout.
        distPath: cloud ? "" : dist.path,
        distExists: dist.exists
      };
    }),

  installHost: protectedProcedure
    .output(z.object({ browsers: z.number().int() }))
    .mutation(() => {
      if (isCloudProfile()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "The browser extension connects only to a NodeTool app on your own computer"
        });
      }
      try {
        return { browsers: installNativeHost().manifests.length };
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: error instanceof Error ? error.message : String(error)
        });
      }
    })
});
