/**
 * FitBadge — small reusable tier/fit badge component.
 *
 * Can be used anywhere a model card, row, or menu item needs to show
 * fit status at a glance.
 */

import React from "react";
import { Chip } from "@mui/material";
import type { FitTier } from "../../local_model_fit/types";

const TIER_COLORS: Record<FitTier, { bg: string; fg: string }> = {
  S: { bg: "#1b5e20", fg: "#a5d6a7" },
  A: { bg: "#2e7d32", fg: "#c8e6c9" },
  B: { bg: "#33691e", fg: "#dce775" },
  C: { bg: "#f57f17", fg: "#fff9c4" },
  D: { bg: "#e65100", fg: "#ffe0b2" },
  F: { bg: "#b71c1c", fg: "#ffcdd2" },
};

interface FitBadgeProps {
  tier: FitTier;
  label?: string;
  size?: "small" | "medium";
}

const FitBadge: React.FC<FitBadgeProps> = ({ tier, label, size = "small" }) => {
  const colors = TIER_COLORS[tier];
  return (
    <Chip
      label={label ?? `Tier ${tier}`}
      size={size}
      sx={{
        backgroundColor: colors.bg,
        color: colors.fg,
        fontWeight: 700,
        fontSize: size === "small" ? "0.7rem" : "0.8rem",
        height: size === "small" ? 22 : 28,
      }}
    />
  );
};

export default React.memo(FitBadge);
