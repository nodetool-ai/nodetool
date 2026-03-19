/**
 * LocalModelFitCard — single card in the grid view.
 */

import React from "react";
import { Box, Card, CardContent, Typography, Chip, Stack } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import FitBadge from "./FitBadge";

interface LocalModelFitCardProps {
  item: RankedModelFit;
}

const LocalModelFitCard: React.FC<LocalModelFitCardProps> = ({ item }) => (
  <Card
    variant="outlined"
    sx={{
      width: 280,
      opacity: item.fits ? 1 : 0.55,
      transition: "box-shadow 0.15s",
      "&:hover": { boxShadow: 4 },
    }}
  >
    <CardContent sx={{ p: 1.5, "&:last-child": { pb: 1.5 } }}>
      {/* Header: name + tier */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", mb: 0.75 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 700, lineHeight: 1.3 }}>
          {item.name}
        </Typography>
        <FitBadge tier={item.tier} />
      </Box>

      {/* Subtitle (variant label) */}
      {item.subtitle && (
        <Typography variant="caption" sx={{ opacity: 0.7, display: "block", mb: 0.5 }}>
          {item.subtitle}
        </Typography>
      )}

      {/* Metrics row */}
      <Box sx={{ display: "flex", gap: 1, mb: 0.75, flexWrap: "wrap" }}>
        <Typography variant="caption">
          {item.memoryGb.toFixed(1)} GB
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          ({item.memoryPercent}%)
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.7 }}>
          ctx {(item.contextLength / 1024).toFixed(0)}k
        </Typography>
      </Box>

      {/* Fit label + score */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 0.75 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }}>
          {item.fitLabel}
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6 }}>
          Score {item.score}
        </Typography>
      </Box>

      {/* Tags */}
      <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap" }}>
        {item.tags.map((t) => (
          <Chip key={t} label={t} size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
        ))}
      </Stack>

      {/* Reasons (first 2) */}
      {item.reasons && item.reasons.length > 0 && (
        <Box sx={{ mt: 0.75 }}>
          {item.reasons.slice(0, 2).map((r, i) => (
            <Typography key={i} variant="caption" sx={{ display: "block", opacity: 0.55, fontSize: "0.65rem" }}>
              — {r}
            </Typography>
          ))}
        </Box>
      )}
    </CardContent>
  </Card>
);

export default React.memo(LocalModelFitCard);
