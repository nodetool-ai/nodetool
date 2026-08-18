/**
 * Integrations router — the browser half of external-account linking
 * (design §5).
 *
 * The service routes under `/api/integrations/*` authenticate with
 * `NODETOOL_INTEGRATION_TOKEN`, which a browser must never hold. These
 * procedures are the user-session-authenticated surface over the same
 * `external_identities` table and the same one-time codes: every one of them
 * reads the user from the session and refuses to act on another user's row.
 *
 * Both link directions land here:
 * - `createLinkCode` mints a code bound to the signed-in user and returns the
 *   `t.me/<bot>?start=<code>` deep link the bridge redeems.
 * - `confirmLink` spends a code the bridge minted, naming this user as its
 *   other half; `describeLinkCode` reads that code first so the confirmation
 *   page can say which account it is about to link.
 */

import { z } from "zod";
import { ExternalIdentity } from "@nodetool-ai/models";
import { ApiErrorCode } from "../../error-codes.js";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import { throwApiError } from "../error-formatter.js";
import { sharedLinkCodes } from "../../lib/link-codes.js";

/** Platforms the identity layer accepts — mirrors the service routes. */
const providerInput = z.enum(["telegram", "discord"]);

const identityOutput = z.object({
  provider: z.string(),
  external_id: z.string(),
  linked_at: z.string()
});

const listOutput = z.object({ identities: z.array(identityOutput) });

const createLinkCodeOutput = z.object({
  code: z.string(),
  /** Null when the server does not know the bot's username (see below). */
  deep_link: z.string().nullable(),
  expires_at: z.string()
});

const describeLinkCodeOutput = z.object({
  provider: z.string(),
  external_id: z.string()
});

const CODE_GONE = "This link code has expired or was already used";

/**
 * The deep link a `t.me` **Start** press turns into `/start <code>`. Only
 * Telegram has one; and only when the operator told the server which bot is
 * theirs, since the username is the bot's own, not something the server can
 * derive. Without it the UI shows the bare code for a manual `/start <code>`.
 */
function deepLinkFor(provider: string, code: string): string | null {
  if (provider !== "telegram") return null;
  const username = process.env["TELEGRAM_BOT_USERNAME"]?.trim().replace(/^@/, "");
  if (!username) return null;
  return `https://t.me/${username}?start=${encodeURIComponent(code)}`;
}

export const integrationsRouter = router({
  /** The signed-in user's linked external accounts. */
  list: protectedProcedure
    .output(listOutput)
    .query(async ({ ctx }) => {
      const identities = await ExternalIdentity.listForUser(ctx.userId);
      return {
        identities: identities.map((identity) => ({
          provider: identity.provider,
          external_id: identity.external_id,
          linked_at: identity.linked_at
        }))
      };
    }),

  /** Mint a one-time code bound to this user, for the deep-link direction. */
  createLinkCode: protectedProcedure
    .input(z.object({ provider: providerInput }))
    .output(createLinkCodeOutput)
    .mutation(({ ctx, input }) => {
      const { code, expiresAtMs } = sharedLinkCodes.mintForUser(
        input.provider,
        ctx.userId
      );
      return {
        code,
        deep_link: deepLinkFor(input.provider, code),
        expires_at: new Date(expiresAtMs).toISOString()
      };
    }),

  /**
   * Read a bridge-minted code without spending it, so the confirmation page
   * can name the account. Expired or already-used codes read as not found.
   */
  describeLinkCode: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .output(describeLinkCodeOutput)
    .query(({ input }) => {
      const pending = sharedLinkCodes.peek(input.code);
      if (!pending || pending.kind !== "external") {
        throwApiError(ApiErrorCode.NOT_FOUND, CODE_GONE);
      }
      return { provider: pending.provider, external_id: pending.externalId };
    }),

  /** Spend a bridge-minted code, linking its account to this user. */
  confirmLink: protectedProcedure
    .input(z.object({ provider: providerInput, code: z.string().min(1) }))
    .output(z.object({ linked: z.literal(true), external_id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const pending = sharedLinkCodes.consume(input.code);
      if (!pending || pending.kind !== "external") {
        throwApiError(ApiErrorCode.NOT_FOUND, CODE_GONE);
      }
      if (pending.provider !== input.provider) {
        throwApiError(
          ApiErrorCode.INVALID_INPUT,
          "This link code was issued for a different provider"
        );
      }
      await ExternalIdentity.link({
        provider: pending.provider,
        externalId: pending.externalId,
        userId: ctx.userId
      });
      return { linked: true as const, external_id: pending.externalId };
    }),

  /** Unlink one of this user's own accounts. Another user's row is not found. */
  unlink: protectedProcedure
    .input(z.object({ provider: providerInput, external_id: z.string().min(1) }))
    .output(z.object({ unlinked: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const identity = await ExternalIdentity.findByExternal(
        input.provider,
        input.external_id
      );
      if (!identity || identity.user_id !== ctx.userId) {
        throwApiError(ApiErrorCode.NOT_FOUND, "This account is not linked");
      }
      return { unlinked: await ExternalIdentity.unlink(
        input.provider,
        input.external_id
      ) };
    })
});
