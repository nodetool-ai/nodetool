/**
 * LocalModelFitRow — single row in the list/table view.
 */

import React from "react";
import { Box, Typography, Chip, Stack } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import FitBadge from "./FitBadge";

interface LocalModelFitRowProps {
  item: RankedModelFit;
}

const LocalModelFitRow: React.FC<LocalModelFitRowProps> = ({ item }) => (
  <Box
    sx={{
      display: "flex",
      alignItems: "center",
      gap: 2,
      px: 2,
      py: 1,
      borderBottom: "1px solid",
      borderColor: "divider",
      opacity: item.fits ? 1 : 0.55,
      "&:hover": { bgcolor: "action.hover" },
    }}
  >
    {/* Tier badge */}
    <Box sx={{ width: 70, flexShrink: 0 }}>
      <FitBadge tier={item.tier} />
    </Box>

    {/* Name + subtitle */}
    <Box sx={{ flex: 1, minWidth: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
        {item.name}
      </Typography>
      {item.subtitle && (
        <Typography variant="caption" sx={{ opacity: 0.6 }} noWrap>
          {item.subtitle}
        </Typography>
      )}
    </Box>

    {/* Memory */}
    <Box sx={{ width: 90, textAlign: "right", flexShrink: 0 }}>
      <Typography variant="body2">{item.memoryGb.toFixed(1)} GB</Typography>
      <Typography variant="caption" sx={{ opacity: 0.6 }}>
        {item.memoryPercent}%
      </Typography>
    </Box>

    {/* Context */}
    <Box sx={{ width: 60, textAlign: "right", flexShrink: 0 }}>
      <Typography variant="caption">
        {(item.contextLength / 1024).toFixed(0)}k
      </Typography>
    </Box>

    {/* Score */}
    <Box sx={{ width: 50, textAlign: "right", flexShrink: 0 }}>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {item.score}
      </Typography>
    </Box>

    {/* Fit label */}
    <Box sx={{ width: 80, flexShrink: 0 }}>
      <Typography variant="caption" sx={{ fontWeight: 600 }}>
        {item.fitLabel}
      </Typography>
    </Box>

    {/* Tags */}
    <Stack direction="row" spacing={0.5} sx={{ flexShrink: 0 }}>
      {item.tags.map((t) => (
        <Chip key={t} label={t} size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
      ))}
    </Stack>
  </Box>
);

export default React.memo(LocalModelFitRow);
