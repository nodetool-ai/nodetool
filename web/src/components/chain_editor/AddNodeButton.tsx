/** @jsxImportSource @emotion/react */
import React from "react";
import { useTranslation } from "react-i18next";
import { useTheme } from "@mui/material/styles";
import { EditorButton } from "../editor_ui";
import { ToolbarIconButton, Box, MOTION, BORDER_RADIUS, ICON_SIZE, SPACING } from "../ui_primitives";
import AddIcon from "@mui/icons-material/AddOutlined";
import { FlexColumn } from "../ui_primitives";

interface AddNodeButtonProps {
  onClick: () => void;
  isHero?: boolean;
}

export const AddNodeButton: React.FC<AddNodeButtonProps> = ({ onClick, isHero = false }) => {
  const theme = useTheme();
  const { t } = useTranslation();

  if (isHero) {
    return (
      <EditorButton
        variant="contained"
        startIcon={<AddIcon />}
        onClick={onClick}
        sx={{
          mt: SPACING.lg,
          px: SPACING.xl,
          py: SPACING.sm,
          borderRadius: BORDER_RADIUS.sm,
          fontSize: "var(--fontSizeNormal)",
          fontWeight: 600,
          textTransform: "none",
        }}
      >
        {t("pass3_0.chainEditor.addNode.addFirstNode")}
      </EditorButton>
    );
  }

  return (
    <FlexColumn align="center" sx={{ py: SPACING.micro }}>
      <Box sx={{ width: 2, height: 14, backgroundColor: theme.vars.palette.divider }} />
      <ToolbarIconButton
        size="small"
        ariaLabel={t("pass3_0.chainEditor.addNode.addNode")}
        tooltip={t("pass3_0.chainEditor.addNode.addNode")}
        onClick={onClick}
        icon={<AddIcon sx={{ fontSize: ICON_SIZE.sm, color: theme.vars.palette.primary.main }} />}
        sx={{
          width: 28,
          height: 28,
          border: `1.5px solid ${theme.vars.palette.divider}`,
          backgroundColor: theme.vars.palette.background.paper,
          "&:hover": {
            borderColor: theme.vars.palette.primary.main,
            backgroundColor: `${theme.vars.palette.primary.main}12`,
          },
          transition: MOTION.all,
        }}
      />
      <Box sx={{ width: 2, height: 14, backgroundColor: theme.vars.palette.divider }} />
    </FlexColumn>
  );
};
