import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import { Caption, FlexColumn, FlexRow, Text, SPACING } from "../ui_primitives";

export interface ModelStatProps {
  label: string;
  value: string;
  icon?: React.ReactNode;
  /** Draw the value in the primary color — for the one number that matters. */
  highlight?: boolean;
}

/** One number plus its caption, as used by the model manager's cards. */
export const ModelStat: React.FC<ModelStatProps> = memo(
  ({ label, value, icon, highlight = false }) => {
    const theme = useTheme();
    return (
      <FlexColumn align="flex-start" gap={SPACING.micro} sx={{ minWidth: 0 }}>
        <FlexRow align="center" gap={SPACING.xs}>
          {icon}
          <Text
            size="big"
            weight={600}
            sx={{
              lineHeight: 1.1,
              fontVariantNumeric: "tabular-nums",
              color: highlight
                ? theme.vars.palette.primary.main
                : theme.vars.palette.text.primary
            }}
          >
            {value}
          </Text>
        </FlexRow>
        <Caption sx={{ opacity: 0.6, whiteSpace: "nowrap" }}>{label}</Caption>
      </FlexColumn>
    );
  }
);

ModelStat.displayName = "ModelStat";
