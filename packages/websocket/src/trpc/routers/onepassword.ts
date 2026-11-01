/**
 * settings.onepassword — connect the desktop app's 1Password account and
 * browse vaults for the Settings key dialog, so a user picks a field instead
 * of typing an `op://` reference.
 *
 * Nothing here returns a secret value. Field listings carry titles, types and
 * the reference that resolves to the field. Every route refuses where user
 * references are off (`userReferencesAllowed()`), since the server's
 * 1Password credentials would otherwise be browsable by any user.
 */

import {
  ONEPASSWORD_ACCOUNT_KEY,
  Setting,
  clearAllSecretCache,
  onePasswordAccount,
  onePasswordBackend,
  onePasswordBrowser,
  userReferencesAllowed
} from "@nodetool-ai/models";
import {
  onePasswordConnectInput,
  onePasswordConnectOutput,
  onePasswordFieldOption,
  onePasswordFieldsInput,
  onePasswordItemsInput,
  onePasswordNamed,
  onePasswordStatusOutput
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import { z } from "zod";
import { ApiErrorCode } from "../../error-codes.js";
import { throwApiError } from "../error-formatter.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";

function requireAvailable(): void {
  if (!userReferencesAllowed()) {
    throwApiError(
      ApiErrorCode.FORBIDDEN,
      "1Password references are turned off on this server."
    );
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function browserFor(userId: string) {
  requireAvailable();
  try {
    return await onePasswordBrowser(userId);
  } catch (err) {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, messageOf(err));
  }
}

async function browse<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (err) {
    throwApiError(ApiErrorCode.SERVICE_UNAVAILABLE, messageOf(err));
  }
}

export const onePasswordRouter = router({
  status: protectedProcedure
    .output(onePasswordStatusOutput)
    .query(async ({ ctx }) => {
      const available = userReferencesAllowed();
      const accountFromEnv = Boolean(
        process.env[ONEPASSWORD_ACCOUNT_KEY]?.trim()
      );
      const account = available ? await onePasswordAccount(ctx.userId) : "";
      const backend = onePasswordBackend(process.env, account);
      return {
        available,
        backend,
        account,
        accountFromEnv,
        canBrowse:
          available &&
          (backend === "sdk-desktop" || backend === "sdk-service-account")
      };
    }),

  /**
   * Save the account and sign in once, which is when the 1Password app asks
   * the user to approve NodeTool. A failed sign-in keeps nothing.
   */
  connect: protectedProcedure
    .input(onePasswordConnectInput)
    .output(onePasswordConnectOutput)
    .mutation(async ({ ctx, input }) => {
      requireAvailable();
      const previous = await Setting.find(ctx.userId, ONEPASSWORD_ACCOUNT_KEY);
      await Setting.upsert({
        userId: ctx.userId,
        key: ONEPASSWORD_ACCOUNT_KEY,
        value: input.account
      });
      clearAllSecretCache();
      try {
        const browser = await onePasswordBrowser(ctx.userId);
        const vaults = await browser.listVaults();
        return { ok: true, message: "", vaultCount: vaults.length };
      } catch (err) {
        if (previous) {
          await Setting.upsert({
            userId: ctx.userId,
            key: ONEPASSWORD_ACCOUNT_KEY,
            value: previous.value
          });
        } else {
          await Setting.deleteSetting(ctx.userId, ONEPASSWORD_ACCOUNT_KEY);
        }
        clearAllSecretCache();
        return { ok: false, message: messageOf(err), vaultCount: 0 };
      }
    }),

  disconnect: protectedProcedure
    .output(z.object({ ok: z.boolean() }))
    .mutation(async ({ ctx }) => {
      requireAvailable();
      await Setting.deleteSetting(ctx.userId, ONEPASSWORD_ACCOUNT_KEY);
      clearAllSecretCache();
      return { ok: true };
    }),

  vaults: protectedProcedure
    .output(z.array(onePasswordNamed))
    .query(async ({ ctx }) => {
      const browser = await browserFor(ctx.userId);
      return browse(() => browser.listVaults());
    }),

  items: protectedProcedure
    .input(onePasswordItemsInput)
    .output(z.array(onePasswordNamed))
    .query(async ({ ctx, input }) => {
      const browser = await browserFor(ctx.userId);
      return browse(() => browser.listItems(input.vaultId));
    }),

  fields: protectedProcedure
    .input(onePasswordFieldsInput)
    .output(z.array(onePasswordFieldOption))
    .query(async ({ ctx, input }) => {
      const browser = await browserFor(ctx.userId);
      return browse(() => browser.listFields(input.vaultId, input.itemId));
    })
});
