import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import AdminPanelSettingsOutlinedIcon from "@mui/icons-material/AdminPanelSettingsOutlined";

import { useIsAdminStatus } from "../../serverState/useAdminUsers";
import {
  EmptyState,
  ICON_SIZE,
  LoadingSpinner,
  PageLayout
} from "../ui_primitives";
import UsersAdmin from "./UsersAdmin";

/**
 * The admin area of a self-hosted SSO server. Opened as a workspace tab from
 * the app menu, which shows the entry to admins only. The server checks admin
 * rights on every call; this page only decides what to render.
 */
const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const admin = useIsAdminStatus();

  let body: React.ReactNode;
  if (admin === "loading") {
    body = <LoadingSpinner />;
  } else if (admin === "denied") {
    body = (
      <EmptyState
        variant="error"
        title={t("admin.page.deniedTitle")}
        description={t("admin.page.deniedDescription")}
      />
    );
  } else {
    body = <UsersAdmin />;
  }

  return (
    <PageLayout
      icon={<AdminPanelSettingsOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
      title={t("admin.page.title")}
      subtitle={t("admin.page.subtitle")}
    >
      {body}
    </PageLayout>
  );
};

AdminPage.displayName = "AdminPage";

export default memo(AdminPage);
