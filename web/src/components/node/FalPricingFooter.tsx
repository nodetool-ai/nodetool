/**
 * FalPricingFooter
 *
 * A small footer "FAL: $X" chip rendered on selected FAL nodes (BaseNode).
 * Clicking opens a Popover that shows:
 *   - the full per-call pricing breakdown,
 *   - a historical per-run cost estimate (when FAL_API_KEY is configured),
 *   - the user's FAL account credit balance (fetched on open), and
 *   - a "View on fal.ai" deep-link to the model page.
 *
 * Extracted from BaseNode.tsx so the per-node FAL logic lives in one place
 * and BaseNode only needs to render `<FalPricingFooter metadata=... selected=... />`.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
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
  MenuItemPrimitive
} from "../ui_primitives";
import { EditorButton } from "../editor_ui";
import type { NodeMetadata } from "../../stores/ApiTypes";
import {
  formatFalUnitPricingShort,
  formatFalUnitPricingTooltip,
  formatFalPerRunEstimate,
  isFalVagueBillingSummary
} from "../../utils/formatFalUnitPricing";
import {
  FAL_DASHBOARD_KEYS_URL,
  falCreditsDetailSuggestsKeysLink,
  fetchFalCredits,
  formatCredits,
  type FalCredits
} from "../../utils/falCredits";
import {
  fetchFalPricingEstimate,
  type FalPricingEstimate
} from "../../utils/falPricingEstimate";

export interface FalPricingFooterProps {
  metadata: NodeMetadata;
  /** Only render the chip while the parent node is selected. */
  selected: boolean;
  /**
   * Canvas chip anchored under the node. `inline`: compact chip for panels (inspector).
   * @default "nodeFooter"
   */
  variant?: "nodeFooter" | "inline";
  /**
   * When this identity changes while the menu is open, close the menu
   * (use the inspected node's id when `variant === "inline"`).
   */
  popoverResetDep?: string;
}

const FalPricingFooterInternal: React.FC<FalPricingFooterProps> = ({
  metadata,
  selected,
  variant = "nodeFooter",
  popoverResetDep
}) => {
  const theme = useTheme();
  const [anchorEl, setAnchorEl] = useState<HTMLElement | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(false);
  const [creditsData, setCreditsData] = useState<FalCredits | null | "error">(
    null
  );
  const [estimateLoading, setEstimateLoading] = useState(false);
  const [estimateData, setEstimateData] = useState<FalPricingEstimate | null>(
    null
  );
  const menuOpen = Boolean(anchorEl);

  const handleClick = useCallback(
    async (e: React.MouseEvent<HTMLElement>) => {
      e.stopPropagation();
      e.preventDefault();
      setAnchorEl(e.currentTarget);
      const endpointId = metadata.fal_unit_pricing?.endpoint_id;
      setCreditsLoading(true);
      setEstimateLoading(true);
      setCreditsData(null);
      setEstimateData(null);

      const [creditsResult, estimateResult] = await Promise.all([
        fetchFalCredits(),
        endpointId ? fetchFalPricingEstimate(endpointId) : Promise.resolve(null),
      ]);

      setCreditsLoading(false);
      setEstimateLoading(false);
      setCreditsData(creditsResult ?? "error");
      setEstimateData(estimateResult);
    },
    [metadata.fal_unit_pricing?.endpoint_id]
  );

  const handleClose = useCallback(() => {
    setAnchorEl(null);
  }, []);

  // Close the menu whenever the parent node is deselected — matches the
  // BaseNode behavior in sketch-editor-main.
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

  const pricing = metadata.fal_unit_pricing ?? null;
  const vaguePrice =
    pricing != null ? isFalVagueBillingSummary(pricing) : false;
  const tier = vaguePrice
    ? theme.vars.palette.warning
    : theme.vars.palette.success;

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
            zIndex: 1000
          }
        : {
            position: "static" as const,
            flexShrink: 0
          }),
      "&:hover": {
        bgcolor: tier.main
      }
    }),
    [tier.dark, tier.contrastText, tier.main, variant]
  );

  if (!selected || !pricing) {
    return null;
  }

  return (
    <>
      <EditorButton
        variant="text"
        className={`node-fal-pricing nodrag nopan fal-pricing-${variant}`}
        aria-haspopup="true"
        aria-expanded={menuOpen}
        onClick={handleClick}
        sx={chipSx}
      >
        {pricing.source === "live" && (
          <span
            style={{ marginRight: 3, fontSize: "0.55rem", opacity: 0.85 }}
            aria-label="live price"
          >
            ●
          </span>
        )}
        {formatFalUnitPricingShort(pricing)}
      </EditorButton>

      <Popover
        anchorEl={anchorEl}
        open={menuOpen}
        onClose={handleClose}
        placement={placement}
        paperSx={{
          minWidth: 220,
          fontSize: "12px"
        }}
      >
        <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: tier.main,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
            }}
          >
            FAL pricing
          </Caption>
          <Text
            sx={{
              fontSize: "12px",
              mt: 0.5,
              whiteSpace: "pre-line",
              color: theme.vars.palette.text.secondary
            }}
          >
            {formatFalUnitPricingTooltip(pricing)}
          </Text>
          {estimateLoading ? (
            <FlexRow gap={1} align="center" sx={{ mt: 1 }}>
              <LoadingSpinner size={12} />
              <Text
                sx={{
                  fontSize: "12px",
                  color: theme.vars.palette.text.secondary
                }}
              >
                Loading estimate…
              </Text>
            </FlexRow>
          ) : estimateData != null ? (
            <Text
              sx={{
                fontSize: "12px",
                mt: 1,
                fontWeight: 600,
                color: theme.vars.palette.text.primary
              }}
            >
              {formatFalPerRunEstimate(
                estimateData.total_cost,
                estimateData.currency
              )}
            </Text>
          ) : null}
        </FlexColumn>

        <Divider />

        <FlexColumn gap={0} sx={{ px: 2, py: 1 }}>
          <Caption
            sx={{
              fontWeight: 600,
              color: theme.vars.palette.text.secondary,
              textTransform: "uppercase",
              letterSpacing: "0.05em"
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
                  color: theme.vars.palette.text.secondary
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
                mt: 0.5
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
                  wordBreak: "break-word"
                }}
              >
                {creditsData.detail ?? "Credits unavailable"}
              </Text>
              {falCreditsDetailSuggestsKeysLink(creditsData.detail) && (
                <ExternalLink
                  href={FAL_DASHBOARD_KEYS_URL}
                  iconVariant="launch"
                  size="small"
                >
                  fal.ai API keys
                </ExternalLink>
              )}
            </FlexColumn>
          ) : (
            <Text
              sx={{
                fontSize: "13px",
                fontWeight: 600,
                color: theme.vars.palette.success.main,
                mt: 0.5
              }}
            >
              {formatCredits(creditsData)} remaining
            </Text>
          )}
        </FlexColumn>

        <Divider />

        <MenuItemPrimitive
          label="View on fal.ai"
          icon={<LaunchIcon sx={{ fontSize: 14 }} />}
          compact
          onClick={() => {
            window.open(
              `https://fal.ai/models/${pricing.endpoint_id}`,
              "_blank",
              "noopener,noreferrer"
            );
            handleClose();
          }}
        />
      </Popover>
    </>
  );
};

export const FalPricingFooter = memo(FalPricingFooterInternal);
export default FalPricingFooter;
