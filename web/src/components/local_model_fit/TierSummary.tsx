/**
 * TierSummary — row of tier count chips.
 *
 * Shows how many models fall into each tier for the current hardware
 * profile.  Clicking a tier chip toggles it as a filter.
 */

import React, { useCallback } from "react";
import { Box, Chip, Typography } from "@mui/material";
import type { FitTier } from "../../local_model_fit/types";
import type { TierCounts } from "../../local_model_fit/summaries";
import { TIER_ORDER } from "../../local_model_fit/summaries";

const TIER_COLORS: Record<FitTier, string> = {
  S: "#1b5e20",
  A: "#2e7d32",
  B: "#33691e",
  C: "#f57f17",
  D: "#e65100",
  F: "#b71c1c",
};

interface TierSummaryProps {
  tierCounts: TierCounts;
  selectedTiers: FitTier[];
  onToggleTier: (tier: FitTier) => void;
  summary: string;
}

const TierSummary: React.FC<TierSummaryProps> = ({
  tierCounts,
  selectedTiers,
  onToggleTier,
  summary,
}) => {
  const handleClick = useCallback(
    (tier: FitTier) => () => onToggleTier(tier),
    [onToggleTier],
  );

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="body2" sx={{ opacity: 0.7 }}>
        {summary}
      </Typography>
      <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
        {TIER_ORDER.map((tier) => {
          const count = tierCounts[tier];
          const isActive =
            selectedTiers.length === 0 || selectedTiers.includes(tier);
          return (
            <Chip
              key={tier}
              label={`${tier}: ${count}`}
              size="small"
              onClick={handleClick(tier)}
              sx={{
                backgroundColor: isActive ? TIER_COLORS[tier] : "transparent",
                border: `1px solid ${TIER_COLORS[tier]}`,
                color: isActive ? "#fff" : TIER_COLORS[tier],
                fontWeight: 600,
                fontSize: "0.75rem",
                cursor: "pointer",
                opacity: count === 0 ? 0.4 : 1,
                "&:hover": { opacity: 0.85 },
              }}
            />
          );
        })}
      </Box>
    </Box>
  );
};

export default React.memo(TierSummary);
