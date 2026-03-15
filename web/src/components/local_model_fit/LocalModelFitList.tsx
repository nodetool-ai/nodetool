/**
 * LocalModelFitList — list/table view of ranked model fits.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import LocalModelFitRow from "./LocalModelFitRow";

interface LocalModelFitListProps {
  results: RankedModelFit[];
}

const HEADER_SX = {
  fontWeight: 700,
  fontSize: "0.7rem",
  textTransform: "uppercase" as const,
  opacity: 0.6,
};

const LocalModelFitList: React.FC<LocalModelFitListProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <Typography variant="body2" sx={{ p: 2, opacity: 0.6 }}>
        No models match the current filters.
      </Typography>
    );
  }

  return (
    <Box>
      {/* Column headers */}
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 0.75,
          borderBottom: "2px solid",
          borderColor: "divider",
        }}
      >
        <Box sx={{ width: 70 }}>
          <Typography sx={HEADER_SX}>Tier</Typography>
        </Box>
        <Box sx={{ flex: 1 }}>
          <Typography sx={HEADER_SX}>Model</Typography>
        </Box>
        <Box sx={{ width: 90, textAlign: "right" }}>
          <Typography sx={HEADER_SX}>Memory</Typography>
        </Box>
        <Box sx={{ width: 60, textAlign: "right" }}>
          <Typography sx={HEADER_SX}>Context</Typography>
        </Box>
        <Box sx={{ width: 50, textAlign: "right" }}>
          <Typography sx={HEADER_SX}>Score</Typography>
        </Box>
        <Box sx={{ width: 80 }}>
          <Typography sx={HEADER_SX}>Fit</Typography>
        </Box>
        <Box>
          <Typography sx={HEADER_SX}>Tags</Typography>
        </Box>
      </Box>

      {/* Rows */}
      {results.map((item) => (
        <LocalModelFitRow key={item.id} item={item} />
      ))}
    </Box>
  );
};

export default React.memo(LocalModelFitList);
