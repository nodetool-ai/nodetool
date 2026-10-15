import React, { memo } from "react";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { Box, StatCard, BORDER_RADIUS } from "../ui_primitives";

interface CostStatCardProps {
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
  icon,
  value,
  decimal,
  valueDotColor,
  caption,
  badge,
  valueVariant = "metric"
}) => (
  <StatCard
    label={label}
    icon={icon}
    value={value}
    decimal={decimal}
    valueVariant={valueVariant}
    valueAdornment={
      valueDotColor ? (
        <Box
          sx={{
            width: 11,
            height: 11,
            borderRadius: BORDER_RADIUS.sm,
            backgroundColor: valueDotColor,
            flexShrink: 0
          }}
        />
      ) : undefined
    }
    delta={badge}
    hint={caption}
  />
);

export const CostStatCard = memo(CostStatCardInternal);
CostStatCard.displayName = "CostStatCard";

export default CostStatCard;
