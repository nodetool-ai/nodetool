import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { LoadingSpinner, TabGroup } from "../ui_primitives";
import DashboardExampleApps from "../portal/DashboardExampleApps";

const DashboardTemplates = lazy(() => import("../portal/DashboardTemplates"));
const DashboardExampleStoryboards = lazy(
  () => import("../portal/DashboardExampleStoryboards")
);
const DashboardExampleTimelines = lazy(
  () => import("../portal/DashboardExampleTimelines")
);
const DashboardExampleSketches = lazy(
  () => import("../portal/DashboardExampleSketches")
);
const DashboardExampleModels = lazy(
  () => import("../portal/DashboardExampleModels")
);
const DashboardExampleGames = lazy(
  () => import("../portal/DashboardExampleGames")
);

interface StartExamplesProps {
  onBrowseAll: () => void;
  /** Opens the Game guided flow from the Games tab. */
  onMakeGame?: () => void;
}

const StartExamples = ({ onBrowseAll, onMakeGame }: StartExamplesProps) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState("apps");
  const exampleTabs = [
    { value: "apps", label: t("pass3_35.startExamples.tabs.apps") },
    { value: "workflows", label: t("pass3_35.startExamples.tabs.workflows") },
    {
      value: "storyboards",
      label: t("pass3_35.startExamples.tabs.storyboards")
    },
    { value: "timelines", label: t("pass3_35.startExamples.tabs.timelines") },
    { value: "sketches", label: t("pass3_35.startExamples.tabs.sketches") },
    { value: "models", label: t("pass3_35.startExamples.tabs.models3d") },
    { value: "games", label: t("pass3_35.startExamples.tabs.games") }
  ];

  return (
    <section aria-label={t("pass3_35.startExamples.sectionLabel")}>
      <TabGroup
        tabs={exampleTabs}
        value={activeTab}
        onChange={setActiveTab}
        aria-label={t("pass3_35.startExamples.tabListLabel")}
        size="small"
      />
      <Suspense
        fallback={
          <LoadingSpinner
            size="medium"
            text={t("pass3_35.startExamples.loading")}
          />
        }
      >
        {activeTab === "apps" ? (
          <DashboardExampleApps compact onBrowseAll={onBrowseAll} />
        ) : activeTab === "workflows" ? (
          <DashboardTemplates />
        ) : activeTab === "storyboards" ? (
          <DashboardExampleStoryboards />
        ) : activeTab === "timelines" ? (
          <DashboardExampleTimelines />
        ) : activeTab === "sketches" ? (
          <DashboardExampleSketches />
        ) : activeTab === "models" ? (
          <DashboardExampleModels />
        ) : (
          <DashboardExampleGames onMakeGame={onMakeGame} />
        )}
      </Suspense>
    </section>
  );
};

export default StartExamples;
