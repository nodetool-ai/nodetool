import { TRPCError } from "@trpc/server";
import {
  CREDIT_PLANS,
  creditStatus,
  grantCredits,
  planById,
  setSubscriptionPlan
} from "@nodetool-ai/models";
import { router } from "../index.js";
import { protectedProcedure } from "../middleware.js";
import {
  creditStatusOutput,
  setPlanInput,
  topupInput
} from "@nodetool-ai/protocol/api-schemas/credits.js";
import { creditsEnforced } from "../../credit-gate.js";

const statusFor = async (userId: string) => {
  const status = await creditStatus(userId);
  return {
    ...status,
    enforced: creditsEnforced(),
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
   * Prototype top-up: adds credits with no payment behind it. A payment
   * provider integration replaces this mutation with a checkout session and
   * writes the ledger row from the webhook instead.
   */
  topup: protectedProcedure
    .input(topupInput)
    .output(creditStatusOutput)
    .mutation(async ({ ctx, input }) => {
      await grantCredits(
        ctx.userId,
        input.credits,
        "topup",
        "Manual top-up (no payment provider configured)"
      );
      return statusFor(ctx.userId);
    })
});
