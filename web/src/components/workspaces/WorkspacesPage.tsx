import React, { memo } from "react";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import { PageLayout } from "../ui_primitives";
import WorkspacesManager from "./WorkspacesManager";

/**
 * Full-screen Workspaces page. Reachable from the logo menu; wraps the
 * workspace manager in the shared manager chrome (header + back button).
 */
const WorkspacesPage: React.FC = () => (
  <PageLayout
    icon={<FolderSpecialOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Workspaces"
    subtitle="Sandboxed folders that agents and workflows can read, write, and organize files in."
    docsTopic="workspaces"
  >
    <WorkspacesManager />
  </PageLayout>
);

WorkspacesPage.displayName = "WorkspacesPage";

export default memo(WorkspacesPage);
