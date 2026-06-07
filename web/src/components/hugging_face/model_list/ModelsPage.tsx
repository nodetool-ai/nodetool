import React, { memo } from "react";
import ViewInArOutlinedIcon from "@mui/icons-material/ViewInArOutlined";
import ManagerPageLayout from "../../panels/ManagerPageLayout";
import ModelListIndex from "./ModelListIndex";

/**
 * Full-screen Model Manager page. Reachable from the logo menu; wraps the
 * model list in the shared manager chrome (header + back button).
 */
const ModelsPage: React.FC = () => (
  <ManagerPageLayout
    icon={<ViewInArOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Model Manager"
    subtitle="Browse, download, and manage local AI models."
    docsUrl="https://docs.nodetool.ai/models.html"
    padded={false}
  >
    <ModelListIndex />
  </ManagerPageLayout>
);

ModelsPage.displayName = "ModelsPage";

export default memo(ModelsPage);
