import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { Box, FlexRow, FlexColumn, Text, BORDER_RADIUS, MOTION } from "../ui_primitives";

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
}

const CostStatCardInternal: React.FC<CostStatCardProps> = ({
  label,
  icon: Icon,
  value,
  decimal,
  valueDotColor,
  caption,
  badge
}) => {
  const theme = useTheme();
  return (
    <FlexColumn
      gap={1.5}
      sx={{
        flex: "1 1 0",
        minWidth: 200,
        padding: "18px 20px",
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

      <FlexRow gap={1} align="center">
        {valueDotColor && (
          <Box
            sx={{
              width: 11,
              height: 11,
              borderRadius: BORDER_RADIUS.sm,
              backgroundColor: valueDotColor,
              flexShrink: 0
            }}
          />
        )}
        <Text
          component="span"
          sx={{
            fontSize: "2rem",
            lineHeight: 1.05,
            fontWeight: 600,
            color: theme.vars.palette.text.primary
          }}
        >
          {value}
          {decimal && (
            <Text
              component="span"
              sx={{
                fontSize: "1.25rem",
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
