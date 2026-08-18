/** @jsxImportSource @emotion/react */
import React, { memo } from "react";
import { useTheme } from "@mui/material/styles";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import {
  Card,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  Text, BORDER_RADIUS } from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import type { HardwareProfile } from "../onboarding/useHardwareProfile";
import HardwareCard from "../onboarding/HardwareCard";
import LocalModelsHero from "./LocalModelsHero";

interface ModelsRightSidebarProps {
  models: UnifiedModel[];
  hardwareProfile: HardwareProfile;
}

const ModelsRightSidebar: React.FC<ModelsRightSidebarProps> = ({
  models,
  hardwareProfile
}) => {
  const theme = useTheme();

  return (
    <FlexColumn
      sx={{
        width: 280,
        minWidth: 280,
        padding: "1.5rem 1rem 1.5rem 1rem",
        gap: "1rem",
        overflowY: "auto",
        overflowX: "hidden"
      }}
    >
      <LocalModelsHero models={models} />

      <HardwareCard profile={hardwareProfile} />

      <Card
        variant="outlined"
        padding="normal"
        sx={{
          borderRadius: BORDER_RADIUS.lg,
          border: `1px solid ${theme.vars.palette.divider}`
        }}
      >
        <FlexRow align="center" gap={1} sx={{ marginBottom: "0.5rem" }}>
          <HelpOutlineIcon
            sx={{ color: theme.vars.palette.primary.main, fontSize: 18 }}
          />
          <Text size="small" weight={600}>
            Need help?
          </Text>
        </FlexRow>
        <Caption sx={{ opacity: 0.6, lineHeight: 1.5, marginBottom: "0.75rem" }}>
          Learn how to add and run models locally.
        </Caption>
        <EditorButton
          density="compact"
          variant="outlined"
          size="small"
          fullWidth
          endIcon={<OpenInNewIcon sx={{ fontSize: 14 }} />}
          onClick={() =>
            window.open(
              "https://docs.nodetool.ai/models-and-providers",
              "_blank",
              "noopener,noreferrer"
            )
          }
        >
          View Documentation
        </EditorButton>
      </Card>
    </FlexColumn>
  );
};

export default memo(ModelsRightSidebar);
