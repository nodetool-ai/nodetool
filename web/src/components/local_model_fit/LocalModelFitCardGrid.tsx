/**
 * LocalModelFitCardGrid — grid of model-fit cards.
 */

import React from "react";
import { Box, Typography } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import LocalModelFitCard from "./LocalModelFitCard";

interface LocalModelFitCardGridProps {
  results: RankedModelFit[];
}

const LocalModelFitCardGrid: React.FC<LocalModelFitCardGridProps> = ({ results }) => {
  if (results.length === 0) {
    return (
      <Typography variant="body2" sx={{ p: 2, opacity: 0.6 }}>
        No models match the current filters.
      </Typography>
    );
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexWrap: "wrap",
        gap: 2,
        p: 1,
      }}
    >
      {results.map((item) => (
        <LocalModelFitCard key={item.id} item={item} />
      ))}
    </Box>
  );
};

export default React.memo(LocalModelFitCardGrid);
