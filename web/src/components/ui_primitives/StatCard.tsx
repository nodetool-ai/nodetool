/**
 * StatCard
 *
 * A labelled figure: small uppercase label, a large value, and an optional
 * delta and hint line. One look for the costs dashboard tiles and the asset
 * storage summary, so a number never gets its own `stat-value` styles.
 */

import { memo } from "react";
import type { ReactNode, ComponentType } from "react";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { Box } from "@mui/material";
import { Card } from "./Card";
import { FlexRow } from "./FlexRow";
import { FlexColumn } from "./FlexColumn";
import { Text } from "./Text";
import { SPACING } from "./spacing";
import { BORDER_RADIUS } from "./tokens";

export interface StatCardProps {
  label: string;
  /** The figure. */
  value: ReactNode;
  /** Dimmer, smaller tail of the value (e.g. cents). */
  decimal?: string;
  /** Icon component shown in a chip at the top right (framed layout only). */
  icon?: ComponentType<SvgIconProps>;
  /** Swatch or marker shown before the value. */
  valueAdornment?: ReactNode;
  /** Change versus a prior period: a chip or text, shown before the hint. */
  delta?: ReactNode;
  /** Secondary line under the value. */
  hint?: ReactNode;
  /**
   * `metric` (default) is a big numeric headline. `label` is an
   * identifier-shaped value: smaller, and it wraps so long names don't overflow.
   */
  valueVariant?: "metric" | "label";
  /**
   * `card` (default) draws the Card frame. `plain` is the bare label and value
   * stack for a summary row inside another surface (a toolbar, a hero).
   */
  layout?: "card" | "plain";
}

const StatCardInternal: React.FC<StatCardProps> = ({
  label,
  value,
  decimal,
  icon: Icon,
  valueAdornment,
  delta,
  hint,
  valueVariant = "metric",
  layout = "card"
}) => {
  const isLabel = valueVariant === "label";
  const plain = layout === "plain";

  const labelEl = (
    <Text
      component="span"
      size="smaller"
      weight={600}
      sx={{
        letterSpacing: plain ? "0.06em" : "0.08em",
        textTransform: "uppercase",
        color: "text.secondary",
        lineHeight: plain ? 1 : undefined
      }}
    >
      {label}
    </Text>
  );

  const valueEl = (
    <Text
      component="span"
      size={plain ? "small" : undefined}
      weight={plain ? 500 : 600}
      sx={{
        ...(plain
          ? { lineHeight: 1.1 }
          : {
              fontSize: isLabel ? "1.25rem" : "2rem",
              lineHeight: isLabel ? 1.2 : 1.05
            }),
        color: "text.primary",
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
            color: "text.disabled"
          }}
        >
          {decimal}
        </Text>
      )}
    </Text>
  );

  if (plain) {
    return (
      <FlexColumn gap={SPACING.micro} align="flex-start">
        {labelEl}
        {valueEl}
      </FlexColumn>
    );
  }

  return (
    <Card
      variant="outlined"
      radius="lg"
      padding={SPACING.xl}
      sx={{
        flex: "1 1 0",
        minWidth: 200,
        display: "flex",
        flexDirection: "column",
        gap: SPACING.sm
      }}
    >
      <FlexRow justify="space-between" align="center">
        {labelEl}
        {Icon && (
          <FlexRow
            align="center"
            justify="center"
            sx={{
              width: 26,
              height: 26,
              borderRadius: BORDER_RADIUS.lg,
              backgroundColor: "action.hover",
              color: "text.disabled"
            }}
          >
            <Icon sx={{ fontSize: 15 }} />
          </FlexRow>
        )}
      </FlexRow>

      <FlexRow
        gap={SPACING.xs}
        align={isLabel ? "flex-start" : "center"}
        sx={{ minWidth: 0 }}
      >
        {valueAdornment && (
          <Box sx={{ mt: isLabel ? SPACING.md : 0, display: "flex" }}>
            {valueAdornment}
          </Box>
        )}
        {valueEl}
      </FlexRow>

      {(delta || hint) && (
        <FlexRow
          gap={SPACING.xs}
          align="center"
          sx={{ rowGap: SPACING.micro }}
          wrap
        >
          {delta}
          {hint && (
            <Text size="small" color="secondary">
              {hint}
            </Text>
          )}
        </FlexRow>
      )}
    </Card>
  );
};

export const StatCard = memo(StatCardInternal);
StatCard.displayName = "StatCard";
