/**
 * KieCreditsFooter
 *
 * Pricing chip + popover for kie.ai nodes (list price when known, account
 * credits on open). Mirrors FalPricingFooter where kie exposes pricing data.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import LaunchIcon from "@mui/icons-material/Launch";
import {
  Popover,
  Divider,
  Text,
  Caption,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  ExternalLink,
  MenuItemPrimitive,
  BORDER_RADIUS,
  Z_INDEX,
  EYEBROW
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import type { NodeMetadata, ProviderCost } from "../../stores/ApiTypes";
import { isKieNodeMetadata } from "../../utils/isKieNode";
import {
  KIE_API_KEY_URL,
  KIE_BILLING_URL,
  KIE_PRICING_URL,
  fetchKieCredits,
  formatKieCredits,
  kieCreditsDetailSuggestsKeysLink,
  type KieCredits,
} from "../../utils/kieCredits";
import { useNodeProviderCost } from "../../hooks/nodes/useNodeExecState";
import {
  formatKieUnitPricingShort,
  formatKieUnitPricingTooltip,
  isKieVagueBillingSummary,
  kiePricingExternalUrl,
} from "../../utils/formatKieUnitPricing";
import { isNumber } from "../../utils/typePredicates";

/**
 * Format a kie node's actual last-run charge. Since #3426, `provider_cost.amount`
 * is USD with the credit count carried in `quantity` — show both so it reads in
 * the credits users buy and the dollars actually billed.
 */
function formatKieLastRun(cost: ProviderCost): string {
  const parts: string[] = [];
  if (
    cost.billing_unit === "credits" &&
    cost.quantity != null &&
    Number.isFinite(cost.quantity)
  ) {
    parts.push(formatKieCredits({ credit_balance: cost.quantity }));
  }
  if (
    cost.currency === "USD" &&
    isNumber(cost.amount) &&
    Number.isFinite(cost.amount)
  ) {
    parts.push(`$${cost.amount.toFixed(4)}`);
  }
  if (parts.length === 0 && isNumber(cost.amount)) {
    return `${cost.amount}${cost.unit ? ` ${cost.unit}` : ""}`;
  }
  return parts.join(" · ");
}

interface KieCreditsFooterProps {
  metadata: NodeMetadata;
  /** Only render the chip while the parent node is selected. */
  selected: boolean;
  nodeId?: string;
  workflowId?: string;
  variant?: "nodeFooter" | "inline";
  popoverResetDep?: string;
}

const KieCreditsFooterInternal: React.FC<KieCreditsFooterProps> = ({
  metadata,
  selected,
  nodeId,
  workflowId,
  variant = "nodeFooter",
  popoverResetDep,
}) => {
  const { t } = useTranslation();
  const theme = useTheme();
  const lastRunCost = useNodeProviderCost(workflowId ?? "", nodeId ?? "");
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsData, setCreditsData] = useState<KieCredits | null | "error">(
    null,
  );
  const menuOpen = Boolean(anchorEl);

  const pricing = metadata.kie_unit_pricing ?? null;
  const vaguePrice =
    pricing != null ? isKieVagueBillingSummary(pricing) : false;
  const tier = pricing
    ? vaguePrice
      ? theme.vars.palette.warning
      : theme.vars.palette.success
    : theme.vars.palette.info;

  const handleClick = useCallback(async (e: React.MouseEvent<HTMLElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setAnchorEl(e.currentTarget);
    setCreditsLoading(true);
    setCreditsData(null);
    const result = await fetchKieCredits();
    setCreditsLoading(false);
    setCreditsData(result ?? "error");
  }, []);

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  useEffect(() => {
    if (!selected) {
      setAnchorEl(null);
    }
  }, [selected]);

  const popoverAnchorPrev = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (popoverResetDep === undefined) {
      return;
    }
    if (
      popoverAnchorPrev.current !== undefined &&
      popoverAnchorPrev.current !== popoverResetDep
    ) {
      setAnchorEl(null);
    }
    popoverAnchorPrev.current = popoverResetDep;
  }, [popoverResetDep]);

  const placement = variant === "inline" ? "bottom-left" : "top-right";

  const chipSx = useMemo(
    () => ({
      bgcolor: tier.dark,
      color: tier.contrastText,
      px: 1,
      py: 0,
      height: 20,
      borderRadius: BORDER_RADIUS.xs,
      fontSize: "var(--fontSizeSmaller)",
      fontWeight: 600,
      lineHeight: 1.4,
      minHeight: 0,
      textTransform: "none",
      border: "1px solid",
      borderColor: "transparent",
      whiteSpace: "nowrap",
      cursor: "pointer",
      ...(variant === "nodeFooter"
        ? {
            position: "absolute" as const,
            bottom: -25,
            right: 4,
            left: "auto",
            flexShrink: 0,
            zIndex: Z_INDEX.toast,
          }
        : {
            position: "static" as const,
            flexShrink: 0,
          }),
      "&:hover": {
        bgcolor: tier.main,
      },
    }),
    [tier.contrastText, tier.dark, tier.main, variant],
  );

  if (!selected || !isKieNodeMetadata(metadata)) {
    return null;
  }

  const chipLabel = pricing
    ? formatKieUnitPricingShort(pricing)
    : t("screen_editor.kieCredits.label");

  return (
    <>
      <EditorButton
        variant="text"
        className={`node-kie-pricing nodrag nopan kie-pricing-${variant}`}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={handleClick}
        sx={chipSx}
      >
        {pricing?.source === "live" && (
          <span
            style={{ marginRight: 4, fontSize: "var(--fontSizeSmaller)", opacity: 0.85 }}
            aria-label={t("screen_editor.kieCredits.livePrice")}
          >
            ●
          </span>
        )}
        {chipLabel}
      </EditorButton>

      <Popover
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleClose}
        placement={placement}
        paperSx={{ minWidth: 220 }}
      >
        {pricing ? (
          <>
            <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
              <Caption
                sx={{
                  ...EYEBROW,
                  color: tier.main,
                }}
              >
                {t("screen_editor.kieCredits.pricing")}
              </Caption>
              <Text
                size="small"
                sx={{
                  mt: 0.5,
                  whiteSpace: "pre-line",
                  color: theme.vars.palette.text.secondary,
                }}
              >
                {formatKieUnitPricingTooltip(pricing)}
              </Text>
            </FlexColumn>
            <Divider />
          </>
        ) : (
          <>
            <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
              <Caption
                sx={{
                  ...EYEBROW,
                  color: tier.main,
                }}
              >
                kie.ai
              </Caption>
              <Text
                size="small"
                sx={{
                  mt: 0.5,
                  color: theme.vars.palette.text.secondary,
                }}
              >
                {t("screen_editor.kieCredits.noBundledPrice")}
              </Text>
            </FlexColumn>
            <Divider />
          </>
        )}

        <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              ...EYEBROW,
              color: theme.vars.palette.text.secondary,
            }}
          >
            {t("screen_editor.kieCredits.accountCredits")}
          </Caption>
          {creditsLoading ? (
            <FlexRow gap={1} align="center" sx={{ mt: 0.5 }}>
              <LoadingSpinner inline size={14} />
              <Text
                size="small"
                sx={{
                  color: theme.vars.palette.text.secondary,
                }}
              >
                {t("screen_editor.kieCredits.loading")}
              </Text>
            </FlexRow>
          ) : creditsData === "error" || creditsData === null ? (
            <Text
              size="small"
              sx={{
                color: theme.vars.palette.text.disabled,
                mt: 0.5,
              }}
            >
              {creditsData === "error" ? t("screen_editor.kieCredits.loadError") : "—"}
            </Text>
          ) : creditsData.unavailable ? (
            <FlexColumn gap={0.5} sx={{ mt: 0.5 }}>
              <Text
                size="small"
                sx={{
                  color: theme.vars.palette.warning.main,
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {creditsData.detail ?? t("screen_editor.kieCredits.unavailable")}
              </Text>
              {kieCreditsDetailSuggestsKeysLink(creditsData.detail) && (
                <ExternalLink
                  href={KIE_API_KEY_URL}
                  iconVariant="launch"
                  size="small"
                >
                  {t("screen_editor.kieCredits.apiKeys")}
                </ExternalLink>
              )}
            </FlexColumn>
          ) : (
            <Text
              size="small"
              sx={{
                fontWeight: 600,
                color: theme.vars.palette.success.main,
                mt: 0.5,
              }}
            >
              {t("screen_editor.kieCredits.remaining", { credits: formatKieCredits(creditsData) })}
            </Text>
          )}
        </FlexColumn>

        {lastRunCost?.provider === "kie" ? (
          <>
            <Divider />
            <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
              <Caption
                sx={{
                  ...EYEBROW,
                  color: theme.vars.palette.text.secondary,
                }}
              >
                {t("screen_editor.kieCredits.lastRun")}
              </Caption>
              <Text
                size="small"
                sx={{
                  fontWeight: 600,
                  color: theme.vars.palette.info.main,
                  mt: 0.5,
                }}
              >
                {formatKieLastRun(lastRunCost)}
              </Text>
            </FlexColumn>
          </>
        ) : null}

        <Divider />

        <MenuItemPrimitive
          label={t("screen_editor.kieCredits.viewPricing")}
          icon={<LaunchIcon />}
          onClick={() => {
            window.open(
              pricing ? kiePricingExternalUrl(pricing) : KIE_PRICING_URL,
              "_blank",
              "noopener,noreferrer",
            );
            handleClose();
          }}
        />

        <MenuItemPrimitive
          label={t("screen_editor.kieCredits.topUp")}
          icon={<LaunchIcon />}
          onClick={() => {
            window.open(KIE_BILLING_URL, "_blank", "noopener,noreferrer");
            handleClose();
          }}
        />
      </Popover>
    </>
  );
};

export const KieCreditsFooter = memo(KieCreditsFooterInternal);
export default KieCreditsFooter;
