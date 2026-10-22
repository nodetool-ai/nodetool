import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  getAntigravityBinaryPath,
  getAntigravityPlatform,
  installAntigravity,
  resolveAntigravityCommand
} from "@nodetool-ai/antigravity-cli";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { isCloudProfile } from "../../lib/cloud-profile.js";

const statusSchema = z.object({
  available: z.boolean(),
  installed: z.boolean(),
  installing: z.boolean(),
  command: z.string().nullable(),
  reason: z.string().nullable()
});
let installation: Promise<string> | null = null;

function unavailableReason(): string | null {
  if (isCloudProfile() || process.env["NODETOOL_ENV"] === "production") {
    return "Antigravity installation is available only in a local NodeTool instance.";
  }
  try {
    getAntigravityPlatform();
    return null;
  } catch {
    return "Antigravity installation supports macOS and Linux on Intel and Apple Silicon / ARM64. Windows installation is not supported yet.";
  }
}

export const antigravityRouter = router({
  status: protectedProcedure.output(statusSchema).query(async () => {
    const reason = unavailableReason();
    if (reason) {
      return {
        available: false,
        installed: false,
        installing: false,
        command: null,
        reason
      };
    }
    const path = getAntigravityBinaryPath();
    const installed = (await resolveAntigravityCommand()) === path;
    return {
      available: true,
      installed,
      installing: installation !== null,
      command: installed ? `'${path.replaceAll("'", "'\\''")}'` : null,
      reason: null
    };
  }),
  install: protectedProcedure
    .output(z.object({ installed: z.literal(true) }))
    .mutation(async () => {
      const reason = unavailableReason();
      if (reason) {
        throw new TRPCError({ code: "FORBIDDEN", message: reason });
      }
      // Keep one download alive across callers and Settings navigation.
      installation ??= installAntigravity().finally(() => {
        installation = null;
      });
      try {
        await installation;
        return { installed: true as const };
      } catch (error) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message:
            "Antigravity could not be installed. Check your connection and available disk space, then try again.",
          cause: error
        });
      }
    })
});
