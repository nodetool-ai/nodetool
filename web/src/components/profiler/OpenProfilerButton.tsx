import React from "react";
import { Box, Button, Paper, Typography, Tooltip } from "@mui/material";
import AnalyticsIcon from "@mui/icons-material/Analytics";
import { useTheme } from "@mui/material/styles";

interface OpenProfilerButtonProps {
  onClick: () => void;
  hasData?: boolean;
}

export const OpenProfilerButton: React.FC<OpenProfilerButtonProps> = ({ onClick, hasData }) => {
  const theme = useTheme();

  return (
    <Tooltip title="Performance Profiler">
      <Button
        onClick={onClick}
        size="small"
        startIcon={<AnalyticsIcon />}
        sx={{
          bgcolor: hasData ? theme.palette.success.light : theme.palette.grey[100],
          color: hasData ? theme.palette.success.dark : theme.palette.text.secondary,
          border: `1px solid ${hasData ? theme.palette.success.main : theme.palette.divider}`,
          "&:hover": {
            bgcolor: hasData ? theme.palette.success.main : theme.palette.grey[200],
            color: hasData ? "white" : theme.palette.text.primary
          }
        }}
      >
        Profile
        {hasData && (
          <Box
            sx={{
              ml: 1,
              width: 8,
              height: 8,
              borderRadius: "50%",
              bgcolor: "success.main"
            }}
          />
        )}
      </Button>
    </Tooltip>
  );
};

export default OpenProfilerButton;
