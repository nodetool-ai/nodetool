import React, { memo, useState } from "react";
import ManagerPageLayout from "../panels/ManagerPageLayout";
import { TabGroup } from "../ui_primitives";
import DashboardExampleApps from "./DashboardExampleApps";
import DashboardExampleGames from "./DashboardExampleGames";
import DashboardExampleModels from "./DashboardExampleModels";
import DashboardExampleSketches from "./DashboardExampleSketches";
import DashboardExampleStoryboards from "./DashboardExampleStoryboards";
import DashboardExampleTimelines from "./DashboardExampleTimelines";
import DashboardTemplates from "./DashboardTemplates";

/**
 * Full-screen Examples page. Reachable from the logo menu; wraps the shipped
 * examples for each editor in separate tabs.
 */
const ExamplesPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState("apps");

  return (
    <ManagerPageLayout padded={false} scrollable showHeader={false}>
      <TabGroup
        tabs={[
          { value: "apps", label: "Apps" },
          { value: "workflows", label: "Workflows" },
          { value: "storyboards", label: "Storyboards" },
          { value: "timelines", label: "Timelines" },
          { value: "sketches", label: "Sketches" },
          { value: "models", label: "3D models" },
          { value: "games", label: "Games" }
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
      ) : activeTab === "timelines" ? (
        <DashboardExampleTimelines />
      ) : activeTab === "sketches" ? (
        <DashboardExampleSketches />
      ) : activeTab === "models" ? (
        <DashboardExampleModels />
      ) : (
        <DashboardExampleGames />
      )}
    </ManagerPageLayout>
  );
};

ExamplesPage.displayName = "ExamplesPage";

export default memo(ExamplesPage);
