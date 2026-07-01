import React, { Suspense } from "react";

import { LoadingSpinner } from "../ui_primitives";
import { PAGE_TAB_TITLES, type PageTabKey } from "./pageTabs";

const TutorialsPage = React.lazy(() => import("../tutorials/TutorialsPage"));
const ExamplesPage = React.lazy(() => import("../portal/ExamplesPage"));
const CostsDashboard = React.lazy(() => import("../costs/CostsDashboard"));
const ModelsPage = React.lazy(
  () => import("../hugging_face/model_list/ModelsPage")
);
const PackagesPage = React.lazy(() => import("../packages/PackagesPage"));
const CollectionsExplorer = React.lazy(
  () => import("../collections/CollectionsExplorer")
);
const WorkspacesPage = React.lazy(
  () => import("../workspaces/WorkspacesPage")
);
const SettingsPage = React.lazy(() => import("../menus/SettingsMenu"));

const PAGE_COMPONENTS: Record<PageTabKey, React.ComponentType> = {
  tutorials: TutorialsPage,
  examples: ExamplesPage,
  costs: CostsDashboard,
  models: ModelsPage,
  packages: PackagesPage,
  collections: CollectionsExplorer,
  workspaces: WorkspacesPage,
  settings: SettingsPage
};

const surfaceStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  overflow: "auto"
};

interface PageSurfaceProps {
  pageKey: PageTabKey;
}

/**
 * Renders an app page (Settings, Costs, Model Manager, …) inside a workspace
 * tab. Each page is the same self-contained component the old route mounted,
 * lazily loaded so it only costs bundle weight once its tab is opened.
 */
const PageSurface = ({ pageKey }: PageSurfaceProps) => {
  const Component = PAGE_COMPONENTS[pageKey];
  return (
    <div style={surfaceStyle} aria-label={PAGE_TAB_TITLES[pageKey]}>
      <Suspense fallback={<LoadingSpinner />}>
        <Component />
      </Suspense>
    </div>
  );
};

export default PageSurface;
