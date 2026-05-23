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
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import type { NodeMetadata } from "../../stores/ApiTypes";
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
import {
  formatKieUnitPricingShort,
  formatKieUnitPricingTooltip,
  isKieVagueBillingSummary,
  kiePricingExternalUrl,
} from "../../utils/formatKieUnitPricing";

export interface KieCreditsFooterProps {
  metadata: NodeMetadata;
  selected: boolean;
  variant?: "nodeFooter" | "inline";
  popoverResetDep?: string;
}

const KieCreditsFooterInternal: React.FC<KieCreditsFooterProps> = ({
  metadata,
  selected,
  variant = "nodeFooter",
  popoverResetDep,
}) => {
  const theme = useTheme();
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
      borderRadius: 1,
      fontSize: "0.65rem",
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
            zIndex: 1000,
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
    : "KIE credits";

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
            style={{ marginRight: 3, fontSize: "0.55rem", opacity: 0.85 }}
            aria-label="live price"
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
        paperSx={{
          minWidth: 220,
          fontSize: "12px",
        }}
      >
        {pricing ? (
          <>
            <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
              <Caption
                sx={{
                  fontWeight: 600,
                  color: tier.main,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                KIE pricing
              </Caption>
              <Text
                sx={{
                  fontSize: "12px",
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
                  fontWeight: 600,
                  color: tier.main,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                kie.ai
              </Caption>
              <Text
                sx={{
                  fontSize: "12px",
                  mt: 0.5,
                  color: theme.vars.palette.text.secondary,
                }}
              >
                No bundled list price for this node. Check kie.ai pricing or run
                with your API key to see account credits.
              </Text>
            </FlexColumn>
            <Divider />
          </>
        )}

        <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            Account credits
          </Caption>
          {creditsLoading ? (
            <FlexRow gap={1} align="center" sx={{ mt: 0.5 }}>
              <LoadingSpinner size={12} />
              <Text
                sx={{
                  fontSize: "12px",
                  color: theme.vars.palette.text.secondary,
                }}
              >
                Loading…
              </Text>
            </FlexRow>
          ) : creditsData === "error" || creditsData === null ? (
            <Text
              sx={{
                fontSize: "12px",
                color: theme.vars.palette.text.disabled,
                mt: 0.5,
              }}
            >
              {creditsData === "error" ? "Could not load credits" : "—"}
            </Text>
          ) : creditsData.unavailable ? (
            <FlexColumn gap={0.5} sx={{ mt: 0.5 }}>
              <Text
                sx={{
                  fontSize: "12px",
                  color: theme.vars.palette.warning.main,
                  lineHeight: 1.4,
                  wordBreak: "break-word",
                }}
              >
                {creditsData.detail ?? "Credits unavailable"}
              </Text>
              {kieCreditsDetailSuggestsKeysLink(creditsData.detail) && (
                <ExternalLink
                  href={KIE_API_KEY_URL}
                  iconVariant="launch"
                  size="small"
                >
                  kie.ai API keys
                </ExternalLink>
              )}
            </FlexColumn>
          ) : (
            <Text
              sx={{
                fontSize: "13px",
                fontWeight: 600,
                color: theme.vars.palette.success.main,
                mt: 0.5,
              }}
            >
              {formatKieCredits(creditsData)} remaining
            </Text>
          )}
        </FlexColumn>

        <Divider />

        <MenuItemPrimitive
          label="View pricing on kie.ai"
          icon={<LaunchIcon sx={{ fontSize: 14 }} />}
          compact
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
          label="Top up credits"
          icon={<LaunchIcon sx={{ fontSize: 14 }} />}
          compact
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
