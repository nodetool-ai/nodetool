import React, { memo } from "react";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import { PageLayout, ICON_SIZE } from "../../ui_primitives";
import ModelListIndex from "./ModelListIndex";

/**
 * Full-screen Model Manager page. Reachable from the logo menu; wraps the
 * model list in the shared manager chrome (header + back button).
 */
const ModelsPage: React.FC = () => (
  <PageLayout
    icon={<ViewInArOutlinedIcon sx={{ fontSize: ICON_SIZE.lg }} />}
    title="Model manager"
    subtitle="Browse, download, and manage local AI models."
    docsTopic="modelsManager"
    padded={false}
  >
    <ModelListIndex />
  </PageLayout>
);

ModelsPage.displayName = "ModelsPage";

export default memo(ModelsPage);
