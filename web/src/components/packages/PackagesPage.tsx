import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import Inventory2OutlinedIcon from "@mui/icons-material/Inventory2Outlined";
import { PageLayout, ICON_SIZE } from "../ui_primitives";
import PackageManager from "./PackageManager";

/**
 * Full-screen Package Manager page: the unified installer (runtimes and node
 * packs) wrapped in the shared manager chrome (header + back button).
 */
const PackagesPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <PageLayout
      icon={<Inventory2OutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
      title={t("screen_models.packages.title")}
      subtitle={t("screen_models.packages.subtitle")}
      docsTopic="nodePacks"
      padded={false}
    >
      <PackageManager />
    </PageLayout>
  );
};

PackagesPage.displayName = "PackagesPage";

export default memo(PackagesPage);
