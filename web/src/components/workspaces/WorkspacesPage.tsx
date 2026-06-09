import React, { memo } from "react";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import WorkspacesManager from "./WorkspacesManager";

/**
 * Full-screen Workspaces page. Reachable from the logo menu; wraps the
 * workspace manager in the shared manager chrome (header + back button).
 */
const WorkspacesPage: React.FC = () => (
  <ManagerPageLayout
    icon={<FolderSpecialOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Workspaces"
    subtitle="Sandboxed folders that agents and workflows can read, write, and organize files in."
    docsUrl="https://docs.nodetool.ai/workspaces.html"
  >
    <WorkspacesManager />
  </ManagerPageLayout>
);

WorkspacesPage.displayName = "WorkspacesPage";

export default memo(WorkspacesPage);
