import React, { memo } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import DashboardTemplates from "./DashboardTemplates";

/**
 * Full-screen Examples page. Reachable from the logo menu and the dashboard's
 * "Browse all" link; wraps the example/template browser in the shared manager
 * chrome (header + back button) and lets it own its scroll.
 */
const ExamplesPage: React.FC = () => (
  <ManagerPageLayout
    icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Examples"
    subtitle="Browse example workflows and start from one."
    padded={false}
  >
    <DashboardTemplates fullPage />
  </ManagerPageLayout>
);

ExamplesPage.displayName = "ExamplesPage";

export default memo(ExamplesPage);
