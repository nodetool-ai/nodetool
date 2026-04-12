/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import { Box, IconButton, Button } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import { FlexColumn } from "../ui_primitives/FlexColumn";

interface AddNodeButtonProps {
  onClick: () => void;
  isHero?: boolean;
}

export const AddNodeButton: React.FC<AddNodeButtonProps> = ({ onClick, isHero = false }) => {
  const theme = useTheme();

  if (isHero) {
    return (
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onClick}
        sx={{
          mt: 3,
          px: 4,
          py: 1.5,
          borderRadius: 2,
          fontSize: theme.fontSizeNormal,
          fontWeight: 700,
          textTransform: "none",
        }}
      >
        Add First Node
      </Button>
    );
  }

  return (
    <FlexColumn align="center" sx={{ py: 0.25 }}>
      <Box sx={{ width: 2, height: 8, backgroundColor: theme.vars.palette.divider }} />
      <IconButton
        size="small"
        onClick={onClick}
        sx={{
          width: 28,
          height: 28,
          border: `1.5px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
          "&:hover": {
            borderColor: theme.vars.palette.primary.main,
            backgroundColor: `${theme.vars.palette.primary.main}12`,
          },
          transition: "all 0.15s",
        }}
      >
        <AddIcon sx={{ fontSize: 16, color: theme.vars.palette.primary.main }} />
      </IconButton>
      <Box sx={{ width: 2, height: 8, backgroundColor: theme.vars.palette.divider }} />
    </FlexColumn>
  );
};
