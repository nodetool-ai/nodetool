/** @jsxImportSource @emotion/react */
import React from "react";
import { useTheme } from "@mui/material/styles";
import { Box } from "@mui/material";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { FlexRow } from "../ui_primitives/FlexRow";
import { FlexColumn } from "../ui_primitives/FlexColumn";
import { Text } from "../ui_primitives/Text";

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
    <FlexColumn align="center" sx={{ py: 0.25 }}>
      <Box sx={{ width: 2, height: 12, backgroundColor: `${color}50` }} />
      <Box sx={{ width: 8, height: 8, borderRadius: "var(--rounded-circle)", backgroundColor: color }} />
      <Box sx={{ width: 2, height: 12, backgroundColor: `${color}50` }} />
      <FlexRow gap={0.5} align="center" sx={{ mt: -0.25 }}>
        <ArrowDownwardIcon sx={{ fontSize: 12, color: theme.vars.palette.text.disabled }} />
        <Text size="tiny" color="secondary">{sourceOutput}</Text>
        <ArrowForwardIcon sx={{ fontSize: 10, color: theme.vars.palette.text.disabled }} />
        <Text size="tiny" color="secondary">{targetInput ?? "auto"}</Text>
      </FlexRow>
    </FlexColumn>
  );
};
