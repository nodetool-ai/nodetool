import React, { Suspense } from "react";
import { useTranslation } from "react-i18next";

import { isCloudProfile } from "../../lib/runtimeConfig";
import { EmptyState, LoadingSpinner } from "../ui_primitives";
import { type PageTabKey } from "./pageTabs";

const AssetExplorer = React.lazy(() => import("../assets/AssetExplorer"));
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
const WorkspacesPage = React.lazy(() => import("../workspaces/WorkspacesPage"));
const SettingsPage = React.lazy(() => import("../menus/SettingsMenu"));
const EntityLibrary = React.lazy(() => import("../entities/EntityLibrary"));
const LipsyncStudio = React.lazy(() => import("../lipsync/LipsyncStudio"));
const EffectsGallery = React.lazy(() => import("../effects/EffectsGallery"));
const MemoryPage = React.lazy(() => import("../memory/MemoryPage"));

const PAGE_COMPONENTS = {
  assets: AssetExplorer,
  tutorials: TutorialsPage,
  examples: ExamplesPage,
  costs: CostsDashboard,
  models: ModelsPage,
  packages: PackagesPage,
  collections: CollectionsExplorer,
  workspaces: WorkspacesPage,
  entities: EntityLibrary,
  lipsync: LipsyncStudio,
  effects: EffectsGallery,
  memory: MemoryPage,
  settings: SettingsPage
} satisfies Record<PageTabKey, React.ComponentType>;

const surfaceStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  width: "100%",
  height: "100%",
  minHeight: 0,
  overflow: "hidden"
};

const SCROLLING_SURFACE_STYLE: React.CSSProperties = {
  ...surfaceStyle,
  overflow: "auto"
};

// These pages fill the tab and scroll inside their own chrome. The rest
// (costs, …) are document-length and scroll this surface.
const SELF_SCROLLING_PAGES = new Set<PageTabKey>([
  "assets",
  "settings",
  "memory",
  "effects",
  "lipsync"
]);

// Pages that manage the server's own machine: downloading models into its
// caches and installing node packs into its process. The cloud never offers
// them (the server refuses those calls too), so a tab restored from an older
// session says so instead of rendering controls that cannot work.
export const LOCAL_ONLY_PAGES: ReadonlySet<PageTabKey> = new Set<PageTabKey>([
  "models",
  "packages"
]);

interface PageSurfaceProps {
  pageKey: PageTabKey;
}

/**
 * Renders an app page (Settings, Costs, Model Manager, …) inside a workspace
 * tab. Each page is the same self-contained component the old route mounted,
 * lazily loaded so it only costs bundle weight once its tab is opened.
 */
const PageSurface = ({ pageKey }: PageSurfaceProps) => {
  const { t } = useTranslation();
  const pageTitle = t(`i18n-next51.page.titles.${pageKey}`);
  if (LOCAL_ONLY_PAGES.has(pageKey) && isCloudProfile()) {
    return (
      <div style={surfaceStyle} aria-label={pageTitle}>
        <EmptyState
          title={t("i18n-next51.page.notAvailable", { page: pageTitle })}
          description={t("i18n-next51.page.localOnlyDescription")}
        />
      </div>
    );
  }
  const Component = PAGE_COMPONENTS[pageKey];
  const style = SELF_SCROLLING_PAGES.has(pageKey)
    ? surfaceStyle
    : SCROLLING_SURFACE_STYLE;
  return (
    <div style={style} aria-label={pageTitle}>
      <Suspense fallback={<LoadingSpinner />}>
        <Component />
      </Suspense>
    </div>
  );
};

export default PageSurface;
