import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { Box, FlexRow, FlexColumn, Text, BORDER_RADIUS } from "../ui_primitives";

export interface CostStatCardProps {
  label: string;
  icon: React.ComponentType<SvgIconProps>;
  /** Large value; `decimal` is rendered dimmer/smaller (e.g. cents). */
  value: string;
  decimal?: string;
  /** Optional swatch shown before the value (top cost driver). */
  valueDotColor?: string;
  /** Secondary line under the value. */
  caption: React.ReactNode;
  /** Optional emphasized badge (e.g. the +64% delta chip). */
  badge?: React.ReactNode;
  /**
   * `metric` (default) renders a big numeric headline.
   * `label` renders an identifier-shaped value smaller and lets it wrap so
   * long names (e.g. `kie.video.BytedanceSeedreamV4`) don't overflow.
   */
  valueVariant?: "metric" | "label";
}

const CostStatCardInternal: React.FC<CostStatCardProps> = ({
  label,
  icon: Icon,
  value,
  decimal,
  valueDotColor,
  caption,
  badge,
  valueVariant = "metric"
}) => {
  const isLabel = valueVariant === "label";
  const theme = useTheme();
  return (
    <FlexColumn
      gap={1.5}
      sx={{
        flex: "1 1 0",
        minWidth: 200,
        padding: theme.spacing(4, 6),
        borderRadius: BORDER_RADIUS.xxl,
        backgroundColor: theme.vars.palette.background.paper,
        border: `1px solid ${theme.vars.palette.divider}`
      }}
    >
      <FlexRow justify="space-between" align="center">
        <Text
          size="smaller"
          weight={600}
          sx={{
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: theme.vars.palette.text.secondary
          }}
        >
          {label}
        </Text>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: 26,
            height: 26,
            borderRadius: BORDER_RADIUS.lg,
            backgroundColor: theme.vars.palette.action.hover,
            color: theme.vars.palette.text.disabled
          }}
        >
          <Icon sx={{ fontSize: 15 }} />
        </Box>
      </FlexRow>

      <FlexRow gap={1} align={isLabel ? "flex-start" : "center"} sx={{ minWidth: 0 }}>
        {valueDotColor && (
          <Box
            sx={{
              width: 11,
              height: 11,
              borderRadius: BORDER_RADIUS.sm,
              backgroundColor: valueDotColor,
              flexShrink: 0,
              mt: isLabel ? "8px" : 0
            }}
          />
        )}
        <Text
          component="span"
          sx={{
            fontSize: isLabel ? "1.25rem" : "2rem",
            lineHeight: isLabel ? 1.2 : 1.05,
            fontWeight: 600,
            color: theme.vars.palette.text.primary,
            minWidth: 0,
            ...(isLabel && {
              wordBreak: "break-word",
              overflowWrap: "anywhere"
            })
          }}
        >
          {value}
          {decimal && (
            <Text
              component="span"
              sx={{
                fontSize: "var(--fontSizeBig)",
                fontWeight: 600,
                color: theme.vars.palette.text.disabled
              }}
            >
              {decimal}
            </Text>
          )}
        </Text>
      </FlexRow>

      <FlexRow gap={1} align="center" sx={{ rowGap: 0.5 }} wrap>
        {badge}
        <Text size="small" color="secondary">
          {caption}
        </Text>
      </FlexRow>
    </FlexColumn>
  );
};

export const CostStatCard = memo(CostStatCardInternal);
CostStatCard.displayName = "CostStatCard";

export default CostStatCard;
