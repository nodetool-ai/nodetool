import React, { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { PageLayout, TabGroup } from "../ui_primitives";
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
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("apps");

  return (
    <PageLayout padded={false} scrollable showHeader={false}>
      <TabGroup
        tabs={[
          { value: "apps", label: t("pass3_18.examples.tabs.apps") },
          { value: "workflows", label: t("pass3_18.examples.tabs.workflows") },
          {
            value: "storyboards",
            label: t("pass3_18.examples.tabs.storyboards")
          },
          { value: "timelines", label: t("pass3_18.examples.tabs.timelines") },
          { value: "sketches", label: t("pass3_18.examples.tabs.sketches") },
          { value: "models", label: t("pass3_18.examples.tabs.models3d") },
          { value: "games", label: t("pass3_18.examples.tabs.games") }
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
    </PageLayout>
  );
};

ExamplesPage.displayName = "ExamplesPage";

export default memo(ExamplesPage);
