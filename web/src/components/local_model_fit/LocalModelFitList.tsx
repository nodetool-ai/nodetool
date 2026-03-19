/**
 * LocalModelFitList — list/table view of ranked model fits.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import LocalModelFitRow from "./LocalModelFitRow";
import { LMF_LIST_COL } from "./localModelFitListLayout";

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
    <Box sx={{ minWidth: 0 }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 2,
          px: 2,
          py: 0.75,
          borderBottom: "2px solid",
          borderColor: "divider",
          minWidth: 0,
        }}
      >
        <Box sx={{ width: LMF_LIST_COL.tier, flexShrink: 0 }}>
          <Typography sx={HEADER_SX}>Tier</Typography>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={HEADER_SX}>Model</Typography>
        </Box>
        <Box
          sx={{
            width: LMF_LIST_COL.memory,
            flexShrink: 0,
            textAlign: "right",
          }}
        >
          <Typography sx={HEADER_SX}>Memory</Typography>
        </Box>
        <Box
          sx={{
            width: LMF_LIST_COL.context,
            flexShrink: 0,
            textAlign: "right",
          }}
        >
          <Typography sx={HEADER_SX}>Context</Typography>
        </Box>
        <Box
          sx={{
            width: LMF_LIST_COL.score,
            flexShrink: 0,
            textAlign: "right",
          }}
        >
          <Typography sx={HEADER_SX}>Score</Typography>
        </Box>
        <Box sx={{ width: LMF_LIST_COL.fit, flexShrink: 0 }}>
          <Typography sx={HEADER_SX}>Fit</Typography>
        </Box>
        <Box
          sx={{
            flex: "1 1 140px",
            minWidth: 120,
            maxWidth: 420,
            textAlign: "right",
          }}
        >
          <Typography sx={HEADER_SX}>Tags</Typography>
        </Box>
      </Box>

      {results.map((item) => (
        <LocalModelFitRow key={item.id} item={item} />
      ))}
    </Box>
  );
};

export default React.memo(LocalModelFitList);
