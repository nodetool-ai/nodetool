import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import FolderSpecialOutlinedIcon from "@mui/icons-material/FolderSpecialOutlined";
import { PageLayout, ICON_SIZE } from "../ui_primitives";
import WorkspacesManager from "./WorkspacesManager";

/**
 * Full-screen Workspaces page. Reachable from the logo menu; wraps the
 * workspace manager in the shared manager chrome (header + back button).
 */
const WorkspacesPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <PageLayout
      icon={<FolderSpecialOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
      title={t("batch2_1.page.title")}
      subtitle={t("batch2_1.page.subtitle")}
      docsTopic="workspaces"
    >
      <WorkspacesManager />
    </PageLayout>
  );
};

WorkspacesPage.displayName = "WorkspacesPage";

export default memo(WorkspacesPage);
