import { lazy, Suspense, useState } from "react";
import { LoadingSpinner, TabGroup } from "../ui_primitives";
import DashboardExampleApps from "../portal/DashboardExampleApps";

const DashboardTemplates = lazy(() => import("../portal/DashboardTemplates"));
const DashboardExampleStoryboards = lazy(
  () => import("../portal/DashboardExampleStoryboards")
);
const DashboardExampleTimelines = lazy(
  () => import("../portal/DashboardExampleTimelines")
);
const DashboardExampleGames = lazy(
  () => import("../portal/DashboardExampleGames")
);

interface StartExamplesProps {
  onBrowseAll: () => void;
}

const EXAMPLE_TABS = [
  { value: "apps", label: "Apps" },
  { value: "workflows", label: "Workflows" },
  { value: "storyboards", label: "Storyboards" },
  { value: "timelines", label: "Timelines" },
  { value: "games", label: "Games" }
];

const StartExamples = ({ onBrowseAll }: StartExamplesProps) => {
  const [activeTab, setActiveTab] = useState("apps");

  return (
    <section aria-label="Examples">
      <TabGroup
        tabs={EXAMPLE_TABS}
        value={activeTab}
        onChange={setActiveTab}
        aria-label="Example types"
        size="small"
      />
      <Suspense fallback={<LoadingSpinner size="medium" text="Loading examples" />}>
        {activeTab === "apps" ? (
          <DashboardExampleApps compact onBrowseAll={onBrowseAll} />
        ) : activeTab === "workflows" ? (
          <DashboardTemplates />
        ) : activeTab === "storyboards" ? (
          <DashboardExampleStoryboards />
        ) : activeTab === "timelines" ? (
          <DashboardExampleTimelines />
        ) : (
          <DashboardExampleGames />
        )}
      </Suspense>
    </section>
  );
};

export default StartExamples;
