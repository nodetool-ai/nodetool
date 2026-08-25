import React, { memo } from "react";
import { FlexColumn, SPACING, getSpacingPx } from "../../ui_primitives";
import type { UnifiedModel } from "../../../stores/ApiTypes";
import type { HardwareProfile } from "../onboarding/useHardwareProfile";
import HardwareCard from "../onboarding/HardwareCard";
import LocalModelsHero from "./LocalModelsHero";

/** Width of the info rail. */
const RAIL_WIDTH = 280;

interface ModelsRightSidebarProps {
  models: UnifiedModel[];
  hardwareProfile: HardwareProfile;
}

/** Context for the list: what is installed, and what this machine can run. */
const ModelsRightSidebar: React.FC<ModelsRightSidebarProps> = ({
  models,
  hardwareProfile
}) => (
  <FlexColumn
    gap={SPACING.lg}
    sx={{
      width: RAIL_WIDTH,
      minWidth: RAIL_WIDTH,
      padding: getSpacingPx(SPACING.xl),
      overflowY: "auto",
      overflowX: "hidden"
    }}
  >
    <LocalModelsHero models={models} />
    <HardwareCard profile={hardwareProfile} dense />
  </FlexColumn>
);

export default memo(ModelsRightSidebar);
