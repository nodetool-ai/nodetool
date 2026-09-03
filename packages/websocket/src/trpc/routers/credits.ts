import { TRPCError } from "@trpc/server";
import {
  CREDIT_PLANS,
  creditStatus,
  grantCredits,
  planById,
  setSubscriptionPlan,
  spendableModelIds
} from "@nodetool-ai/models";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  creditStatusOutput,
  setPlanInput,
  topupInput
} from "@nodetool-ai/protocol/api-schemas/credits.js";
import { NODETOOL_PROVIDER_ID } from "@nodetool-ai/protocol";

/**
 * Whether the unauthenticated-by-payment test top-up is allowed. Off unless
 * the operator explicitly opts a development server in: minted credits unlock
 * spend on platform-owned keys, so an open mint endpoint is an open wallet.
 */
const testTopupEnabled = (): boolean => {
  const value = process.env.NODETOOL_ENABLE_TEST_TOPUP?.toLowerCase();
  return value === "1" || value === "true";
};

const statusFor = async (userId: string) => {
  const status = await creditStatus(userId);
  return {
    ...status,
    meteredProvider: NODETOOL_PROVIDER_ID,
    testTopupEnabled: testTopupEnabled(),
    spendableModels: spendableModelIds(),
    plans: [...CREDIT_PLANS]
  };
};

/**
 * User credits and subscription plans (the Studio billing layer). Balance and
 * plan catalog come from `@nodetool-ai/models`; the monthly plan grant
 * accrues lazily on the first status read of the month.
 */
export const creditsRouter = router({
  status: protectedProcedure
    .output(creditStatusOutput)
    .query(({ ctx }) => statusFor(ctx.userId)),

  setPlan: protectedProcedure
    .input(setPlanInput)
    .output(creditStatusOutput)
    .mutation(async ({ ctx, input }) => {
      if (!planById(input.planId)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Unknown plan "${input.planId}".`
        });
      }
      await setSubscriptionPlan(ctx.userId, input.planId);
      return statusFor(ctx.userId);
    }),

  /**
   * Development-only top-up: adds credits with no payment behind it, and is
   * refused unless the operator sets NODETOOL_ENABLE_TEST_TOPUP. A payment
   * provider integration replaces this mutation with a checkout session and
   * writes the ledger row from the webhook instead.
   */
  topup: protectedProcedure
    .input(topupInput)
    .output(creditStatusOutput)
    .mutation(async ({ ctx, input }) => {
      if (!testTopupEnabled()) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Top-ups are disabled on this server: no payment provider is " +
            "configured and NODETOOL_ENABLE_TEST_TOPUP is not set."
        });
      }
      await grantCredits(
        ctx.userId,
        input.credits,
        "topup",
        "Manual top-up (no payment provider configured)"
      );
      return statusFor(ctx.userId);
    })
});
