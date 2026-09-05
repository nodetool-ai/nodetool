import React, { memo } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import DashboardRecipes from "./DashboardRecipes";
import DashboardTemplates from "./DashboardTemplates";

/**
 * Full-screen Examples page. Reachable from the logo menu; wraps the recipes
 * (ordered chains of examples) and the example/template browser in the shared
 * manager chrome (header + back button) and lets the browser own its scroll.
 */
const ExamplesPage: React.FC = () => (
  <ManagerPageLayout
    icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 22 }} />}
    title="Examples"
    subtitle="Browse example workflows and recipes, and start from one."
    docsTopic="examples"
    padded={false}
  >
    <>
      <DashboardRecipes />
      <DashboardTemplates fullPage />
    </>
  </ManagerPageLayout>
);

ExamplesPage.displayName = "ExamplesPage";

export default memo(ExamplesPage);
