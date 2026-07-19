/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import { Box, BORDER_RADIUS, FlexRow, FlexColumn, Text } from "../ui_primitives";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";

interface ChainConnectorProps {
  sourceOutput: string;
  targetInput: string | null;
  hasWarning?: boolean;
}

export const ChainConnector: React.FC<ChainConnectorProps> = ({
  sourceOutput, targetInput, hasWarning = false,
}) => {
  const theme = useTheme();
  const color = hasWarning ? theme.vars.palette.warning.main : theme.vars.palette.primary.main;

  return (
    <FlexColumn align="center" sx={{ py: 0.5 }}>
      <Box sx={{ width: 2, height: 12, backgroundColor: `${color}50` }} />
      <Box sx={{ width: 8, height: 8, borderRadius: BORDER_RADIUS.circle, backgroundColor: color }} />
      <Box sx={{ width: 2, height: 12, backgroundColor: `${color}50` }} />
      <FlexRow gap={0.5} align="center" sx={{ mt: -0.5 }}>
        <ArrowDownwardIcon sx={{ fontSize: 12, color: theme.vars.palette.text.disabled }} />
        <Text size="smaller" color="secondary">{sourceOutput}</Text>
        <ArrowForwardIcon sx={{ fontSize: 10, color: theme.vars.palette.text.disabled }} />
        <Text size="smaller" color="secondary">{targetInput ?? "auto"}</Text>
      </FlexRow>
    </FlexColumn>
  );
};
