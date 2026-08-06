/** @jsxImportSource @emotion/react */
/**
 * Plan & credits: the Studio account page. Balance and usage from
 * `trpc.credits.status`, plan switching via `credits.setPlan`, and a
 * prototype top-up (`credits.topup` — no payment provider behind it yet, and
 * the button says so).
 */

import { useState } from "react";
import { useTheme } from "@mui/material/styles";
import BoltRoundedIcon from "@mui/icons-material/BoltRounded";
import {
  AlertBanner,
  Card,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  Text
} from "../components/ui_primitives";
import { trpc } from "../trpc/client";
import { useStudioCredits } from "./useStudioCredits";
import StudioShell from "./StudioShell";

const TOPUP_CREDITS = 1_000;

const StudioAccountPage = () => {
  const theme = useTheme();
  const { status, loading } = useStudioCredits();
  const utils = trpc.useUtils();
  const [error, setError] = useState<string | null>(null);

  const onSettled = {
    onSuccess: () => {
      setError(null);
      void utils.credits.status.invalidate();
    },
    onError: (e: { message: string }) => setError(e.message)
  };
  const setPlan = trpc.credits.setPlan.useMutation(onSettled);
  const topup = trpc.credits.topup.useMutation(onSettled);

  return (
    <StudioShell title="Plan & credits">
      <FlexColumn
        align="center"
        gap={SPACING.xl}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: SPACING.xl }}
      >
        {loading && <LoadingSpinner />}
        {error && (
          <AlertBanner severity="error" onClose={() => setError(null)}>
            {error}
          </AlertBanner>
        )}
        {status && (
          <>
            <Card
              variant="outlined"
              padding="comfortable"
              sx={{ width: "100%", maxWidth: 880 }}
            >
              <FlexRow align="center" gap={SPACING.lg} wrap>
                <BoltRoundedIcon />
                <FlexColumn sx={{ flex: 1, minWidth: 200 }}>
                  <Text size="giant" weight={600}>
                    {status.balanceCredits} credits
                  </Text>
                  <Text size="small" color="secondary">
                    {status.plan.name} plan · {status.spentCredits} used of{" "}
                    {status.grantedCredits} granted · resets monthly (
                    {status.periodKey})
                  </Text>
                </FlexColumn>
                {status.testTopupEnabled && (
                  <EditorButton
                    variant="outlined"
                    disabled={topup.isPending}
                    onClick={() => topup.mutate({ credits: TOPUP_CREDITS })}
                  >
                    {topup.isPending
                      ? "Adding…"
                      : `Add ${TOPUP_CREDITS} credits (test)`}
                  </EditorButton>
                )}
              </FlexRow>
              <Text size="smaller" color="secondary" sx={{ mt: SPACING.md }}>
                Credits meter NodeTool's managed models only — bring your own
                provider keys and those calls stay unmetered.
              </Text>
            </Card>

            <FlexColumn gap={SPACING.sm} sx={{ width: "100%", maxWidth: 880 }}>
              <Text size="small" weight={600} color="secondary">
                Plans
              </Text>
              <FlexRow gap={SPACING.lg} wrap>
                {status.plans.map((plan) => {
                  const current = plan.id === status.plan.id;
                  return (
                    <Card
                      key={plan.id}
                      variant="outlined"
                      padding="comfortable"
                      sx={{
                        flex: 1,
                        minWidth: 220,
                        borderColor: current
                          ? theme.vars.palette.primary.main
                          : undefined
                      }}
                    >
                      <FlexColumn gap={SPACING.md} align="flex-start">
                        <FlexRow
                          align="center"
                          gap={SPACING.sm}
                          justify="space-between"
                          fullWidth
                        >
                          <Text size="big" weight={600}>
                            {plan.name}
                          </Text>
                          {current && <Chip compact label="Current" />}
                        </FlexRow>
                        <Text size="normal">
                          {plan.monthlyCredits.toLocaleString()} credits / month
                        </Text>
                        <Text size="small" color="secondary">
                          {plan.priceUsdPerMonth === 0
                            ? "Free"
                            : `$${plan.priceUsdPerMonth}/month`}
                        </Text>
                        <Text size="small" color="secondary">
                          {plan.blurb}
                        </Text>
                        <EditorButton
                          variant={current ? "outlined" : "contained"}
                          disabled={current || setPlan.isPending}
                          onClick={() => setPlan.mutate({ planId: plan.id })}
                        >
                          {current ? "Selected" : "Switch to " + plan.name}
                        </EditorButton>
                      </FlexColumn>
                    </Card>
                  );
                })}
              </FlexRow>
              <Text size="smaller" color="secondary">
                Plan changes are instant and unbilled in this prototype — a
                payment provider hooks in behind the same ledger.
              </Text>
            </FlexColumn>
          </>
        )}
      </FlexColumn>
    </StudioShell>
  );
};

export default StudioAccountPage;
