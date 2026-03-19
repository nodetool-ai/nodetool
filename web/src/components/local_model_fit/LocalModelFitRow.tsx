/**
 * LocalModelFitRow — single row in the list/table view.
 */

import React from "react";
import { Box, Typography, Chip, Stack } from "@mui/material";
import type { RankedModelFit } from "../../local_model_fit/types";
import FitBadge from "./FitBadge";
import { LMF_LIST_COL } from "./localModelFitListLayout";

interface LocalModelFitRowProps {
  item: RankedModelFit;
}

const LocalModelFitRow: React.FC<LocalModelFitRowProps> = ({ item }) => {
  const tags = item.tags;

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "flex-start",
        gap: 2,
        px: 2,
        py: 1,
        borderBottom: "1px solid",
        borderColor: "divider",
        opacity: item.fits ? 1 : 0.55,
        minWidth: 0,
        "&:hover": { bgcolor: "action.hover" },
      }}
    >
      <Box sx={{ width: LMF_LIST_COL.tier, flexShrink: 0, pt: 0.25 }}>
        <FitBadge tier={item.tier} />
      </Box>

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

      <Box
        sx={{
          width: LMF_LIST_COL.memory,
          flexShrink: 0,
          textAlign: "right",
          pt: 0.25,
        }}
      >
        <Typography variant="body2" noWrap>
          {item.memoryGb.toFixed(1)} GB
        </Typography>
        <Typography variant="caption" sx={{ opacity: 0.6 }} noWrap>
          {item.memoryPercent}%
        </Typography>
      </Box>

      <Box
        sx={{
          width: LMF_LIST_COL.context,
          flexShrink: 0,
          textAlign: "right",
          pt: 0.5,
        }}
      >
        <Typography variant="caption" noWrap>
          {(item.contextLength / 1024).toFixed(0)}k
        </Typography>
      </Box>

      <Box
        sx={{
          width: LMF_LIST_COL.score,
          flexShrink: 0,
          textAlign: "right",
          pt: 0.25,
        }}
      >
        <Typography variant="body2" sx={{ fontWeight: 600 }} noWrap>
          {item.score}
        </Typography>
      </Box>

      <Box sx={{ width: LMF_LIST_COL.fit, flexShrink: 0, pt: 0.5 }}>
        <Typography variant="caption" sx={{ fontWeight: 600 }} noWrap>
          {item.fitLabel}
        </Typography>
      </Box>

      <Box
        sx={{
          flex: "1 1 140px",
          minWidth: 120,
          maxWidth: 420,
        }}
      >
        <Stack
          direction="row"
          spacing={0.5}
          useFlexGap
          sx={{
            flexWrap: "wrap",
            justifyContent: "flex-end",
            rowGap: 0.5,
          }}
        >
          {tags.map((t) => (
            <Chip
              key={t}
              label={t}
              size="small"
              sx={{
                fontSize: "0.65rem",
                height: 20,
                maxWidth: "100%",
                "& .MuiChip-label": {
                  px: 0.75,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                },
              }}
            />
          ))}
        </Stack>
      </Box>
    </Box>
  );
};

export default React.memo(LocalModelFitRow);
