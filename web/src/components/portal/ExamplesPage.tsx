import React, { memo, useState } from "react";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import { TabGroup } from "../ui_primitives";
import DashboardExampleApps from "./DashboardExampleApps";
import DashboardExampleStoryboards from "./DashboardExampleStoryboards";
import DashboardExampleTimelines from "./DashboardExampleTimelines";
import DashboardTemplates from "./DashboardTemplates";

/**
 * Full-screen Examples page. Reachable from the logo menu; wraps the shipped
 * example apps, workflows, storyboards, and timelines in separate tabs.
 */
const ExamplesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("apps");

  return (
    <ManagerPageLayout
      padded={false}
      scrollable
      showHeader={false}
    >
      <TabGroup
        tabs={[
          { value: "apps", label: "Apps" },
          { value: "workflows", label: "Workflows" },
          { value: "storyboards", label: "Storyboards" },
          { value: "timelines", label: "Timelines" }
        ]}
        value={activeTab}
        onChange={setActiveTab}
        sx={{ flexShrink: 0, borderBottom: 1, borderColor: "divider" }}
      />
      {activeTab === "apps" ? (
        <DashboardExampleApps />
      ) : activeTab === "workflows" ? (
        <DashboardTemplates fullPage />
      ) : activeTab === "storyboards" ? (
        <DashboardExampleStoryboards />
      ) : (
        <DashboardExampleTimelines />
      )}
    </ManagerPageLayout>
  );
};

ExamplesPage.displayName = "ExamplesPage";

export default memo(ExamplesPage);
