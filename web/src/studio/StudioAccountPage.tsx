/** @jsxImportSource @emotion/react */
/**
 * Plan & credits: the Studio account page. Balance and usage from
 * `trpc.credits.status`, plan switching via `credits.setPlan`, and a
 * prototype top-up (`credits.topup` — no payment provider behind it yet, and
 * the button says so).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
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
  const { t, i18n } = useTranslation();
  const theme = useTheme();
  const { status, loading, unavailable, refetch } = useStudioCredits();
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
    <StudioShell title={t("screen_remaining.studio.accountTitle")}>
      <FlexColumn
        align="center"
        gap={SPACING.xl}
        sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: SPACING.xl }}
      >
        {loading && <LoadingSpinner />}
        {unavailable && (
          <AlertBanner severity="warning">
            {t("screen_remaining.studio.balanceUnknown")} {" "}
            <EditorButton size="small" onClick={refetch}>
              {t("screen_remaining.studio.retry")}
            </EditorButton>
          </AlertBanner>
        )}
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
                {t("screen_remaining.studio.creditsCount", { count: status.balanceCredits })}
                  </Text>
                  <Text size="small" color="secondary">
                    {t("i18n-next99.studio.account.balanceSummary", {
                      plan: status.plan.name,
                      spent: status.spentCredits,
                      granted: status.grantedCredits,
                      period: status.periodKey
                    })}
                  </Text>
                </FlexColumn>
                {status.testTopupEnabled && (
                  <EditorButton
                    variant="outlined"
                    disabled={topup.isPending}
                    onClick={() => topup.mutate({ credits: TOPUP_CREDITS })}
                  >
                    {topup.isPending
                      ? t("screen_remaining.studio.adding")
                      : t("screen_remaining.studio.addCredits", { count: TOPUP_CREDITS })}
                  </EditorButton>
                )}
              </FlexRow>
              <Text size="smaller" color="secondary" sx={{ mt: SPACING.md }}>
                {t("screen_remaining.studio.creditMeterNotice")}
              </Text>
            </Card>

            <FlexColumn gap={SPACING.sm} sx={{ width: "100%", maxWidth: 880 }}>
              <Text size="small" weight={600} color="secondary">
                {t("screen_remaining.studio.plans")}
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
                          {current && <Chip compact label={t("screen_remaining.studio.current")} />}
                        </FlexRow>
                        <Text size="normal">
                          {t("i18n-next99.studio.account.monthlyCredits", {
                            count: plan.monthlyCredits,
                            formattedCount: new Intl.NumberFormat(
                              i18n.language
                            ).format(plan.monthlyCredits)
                          })}
                        </Text>
                        <Text size="small" color="secondary">
                          {plan.priceUsdPerMonth === 0
                            ? t("screen_remaining.studio.free")
                            : t("i18n-next99.studio.account.pricePerMonth", {
                                price: plan.priceUsdPerMonth
                              })}
                        </Text>
                        <Text size="small" color="secondary">
                          {plan.blurb}
                        </Text>
                        <EditorButton
                          variant={current ? "outlined" : "contained"}
                          disabled={current || setPlan.isPending}
                          onClick={() => setPlan.mutate({ planId: plan.id })}
                        >
                          {current ? t("screen_remaining.studio.selected") : t("screen_remaining.studio.switchTo", { plan: plan.name })}
                        </EditorButton>
                      </FlexColumn>
                    </Card>
                  );
                })}
              </FlexRow>
              <Text size="smaller" color="secondary">
                {t("screen_remaining.studio.planChanges")}
              </Text>
            </FlexColumn>
          </>
        )}
      </FlexColumn>
    </StudioShell>
  );
};

export default StudioAccountPage;
