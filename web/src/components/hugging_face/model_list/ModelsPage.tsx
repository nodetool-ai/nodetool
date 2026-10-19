import React, { memo } from "react";
import { useTranslation } from "react-i18next";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import { PageLayout, ICON_SIZE } from "../../ui_primitives";
import ModelListIndex from "./ModelListIndex";

/**
 * Full-screen Model Manager page. Reachable from the logo menu; wraps the
 * model list in the shared manager chrome (header + back button).
 */
const ModelsPage: React.FC = () => {
  const { t } = useTranslation();
  return (
    <PageLayout
      icon={<ViewInArOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
      title={t("i18n-next29.page.title")}
      subtitle={t("i18n-next29.page.subtitle")}
      docsTopic="modelsManager"
      padded={false}
    >
      <ModelListIndex />
    </PageLayout>
  );
};

ModelsPage.displayName = "ModelsPage";

export default memo(ModelsPage);
