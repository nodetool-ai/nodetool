import { memo } from "react";
import FolderOutlinedIcon from "@mui/icons-material/FolderOutlined";

import { useProjectFolder } from "../../hooks/useProjectFolder";
import { FlexRow, SPACING, Text } from "../ui_primitives";

interface ProjectPanelHeaderProps {
  readonly projectId: string;
}

/**
 * The selected project's name, above the Chats, Documents and Files sections.
 * Those three sections show this project's work, and the name says which
 * project that is. Renders nothing until the project list has loaded.
 */
const ProjectPanelHeader = ({ projectId }: ProjectPanelHeaderProps) => {
  const { projectName } = useProjectFolder(projectId);
  if (!projectName) {
    return null;
  }
  return (
    <FlexRow
      className="project-panel-header"
      align="center"
      gap={SPACING.md}
      sx={{ px: SPACING.lg, py: SPACING.md, flexShrink: 0, minWidth: 0 }}
    >
      <FolderOutlinedIcon fontSize="small" color="action" />
      <Text component="h2" size="normal" weight={600} truncate title={projectName}>
        {projectName}
      </Text>
    </FlexRow>
  );
};

export default memo(ProjectPanelHeader);
