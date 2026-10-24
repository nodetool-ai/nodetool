import React, { memo, Suspense } from "react";
import { useTranslation } from "react-i18next";
import type {
  WorkspaceTab,
  WorkspaceTabType
} from "../../stores/WorkspaceTabsStore";
import { FlexColumn, LoadingSpinner } from "../ui_primitives";
import { isPageTabKey } from "./pageTabs";
import WorkspaceDocumentBar from "./WorkspaceDocumentBar";

// One surface per document type, each behind its own chunk. Imported eagerly
// they landed in the workspace chunk together — opening the app downloaded the
// node editor, Monaco, Lexical, three.js, wavesurfer and the app builder before
// showing an empty workspace. A tab only needs the surface for its own type,
// and the common case (no tabs open) needs none of them.
const WorkflowEditorSurface = React.lazy(() => import("./WorkflowEditorSurface"));
const ImageSurface = React.lazy(() => import("./ImageSurface"));
const SvgSurface = React.lazy(() => import("./SvgSurface"));
const SketchSurface = React.lazy(() => import("./SketchSurface"));
const TextSurface = React.lazy(() => import("./TextSurface"));
const Model3DSurface = React.lazy(() => import("./Model3DSurface"));
const AudioSurface = React.lazy(() => import("./AudioSurface"));
const TimelineSurface = React.lazy(() => import("./TimelineSurface"));
const StoryboardSurface = React.lazy(() => import("./StoryboardSurface"));
const ScriptSurface = React.lazy(() => import("./ScriptSurface"));
const JsScriptSurface = React.lazy(() => import("./JsScriptSurface"));
const SkillSurface = React.lazy(() => import("./SkillSurface"));
const ApplicationSurface = React.lazy(() => import("./ApplicationSurface"));
const ExampleAppSurface = React.lazy(() => import("./ExampleAppSurface"));
const GameSurface = React.lazy(() => import("./GameSurface"));
const ChatSurface = React.lazy(() => import("./ChatSurface"));
const PageSurface = React.lazy(() => import("./PageSurface"));
const WorkspaceFileSurface = React.lazy(
  () => import("./WorkspaceFileSurface")
);
const ProjectListSurface = React.lazy(
  () => import("../projects/ProjectListSurface")
);
const NewProjectSurface = React.lazy(
  () => import("../projects/NewProjectSurface")
);

/**
 * Types whose surface does not render its own `DocumentBar` yet. They get the
 * generic bar (title and View/Edit) above the surface, so the View/Edit switch
 * still has a place now that it left the app bar. A type leaves this set when
 * its surface renders `WorkspaceDocumentBar` itself.
 */
const GENERIC_DOCUMENT_BAR_TYPES: ReadonlySet<WorkspaceTabType> = new Set([
  "application"
]);

interface TabContentProps {
  tab: WorkspaceTab;
  active: boolean;
}

const surfaceFor = (tab: WorkspaceTab, active: boolean) => {
  switch (tab.type) {
    case "workflow":
      return (
        <WorkflowEditorSurface
          workflowId={tab.ref}
          mode={tab.mode}
          active={active}
        />
      );
    case "image":
      return (
        <ImageSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "svg":
      return (
        <SvgSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "sketch":
      return (
        <SketchSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "text":
      return (
        <TextSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "model3d":
      return (
        <Model3DSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "audio":
      return (
        <AudioSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "timeline":
      return (
        <TimelineSurface
          refId={tab.ref}
          mode={tab.mode}
          active={active}
          tab={tab}
        />
      );
    case "storyboard":
      return (
        <StoryboardSurface refId={tab.ref} mode={tab.mode} active={active} />
      );
    case "script":
      return (
        <ScriptSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "jsscript":
      return (
        <JsScriptSurface
          refId={tab.ref}
          mode={tab.mode}
          active={active}
          tab={tab}
        />
      );
    case "skill":
      return (
        <SkillSurface refId={tab.ref} mode={tab.mode} active={active} tab={tab} />
      );
    case "workspace-file":
      return (
        <WorkspaceFileSurface
          refId={tab.ref}
          mode={tab.mode}
          active={active}
          tab={tab}
        />
      );
    case "application":
      return <ApplicationSurface refId={tab.ref} mode={tab.mode} instanceId={tab.instanceId} selectedRunId={tab.selectedRunId} />;
    case "example-app":
      return <ExampleAppSurface slug={tab.ref} title={tab.title} />;
    case "game":
      return <GameSurface refId={tab.ref} active={active} mode={tab.mode} tab={tab} />;
    case "chat":
      return <ChatSurface refId={tab.ref} active={active} />;
    case "page":
      return isPageTabKey(tab.ref) ? <PageSurface pageKey={tab.ref} /> : null;
    case "project-list":
      return <ProjectListSurface />;
    case "project":
      // Old persisted overview tabs land on editor home.
      return <NewProjectSurface active={active} />;
    case "guided-flow":
      return (
        <NewProjectSurface
          flowRef={tab.ref}
          initialSetupTarget={tab.setupTarget}
          active={active}
        />
      );
    case "project-new":
      return <NewProjectSurface active={active} />;
    default: {
      // Exhaustiveness guard — a new WorkspaceTabType must add a case here.
      const exhaustive: never = tab.type;
      return exhaustive;
    }
  }
};

/**
 * Resolves a workspace tab's `(type, mode)` to its editor surface. Most types
 * delegate to a `{ refId, mode, active }` surface that wraps the existing
 * viewer/editor for that document type.
 *
 * Memoized because every open tab stays mounted: without it, one WorkspaceShell
 * render re-renders every surface at once. `WorkspaceTabsStore` replaces a tab
 * object only when that tab changes, so the shallow compare holds.
 */
const TabContent = ({ tab, active }: TabContentProps) => {
  const { t } = useTranslation();

  const surface = (
    <Suspense
      fallback={
        <LoadingSpinner text={t("i18n-next84.tabContent.loading")} />
      }
    >
      {surfaceFor(tab, active)}
    </Suspense>
  );

  if (!GENERIC_DOCUMENT_BAR_TYPES.has(tab.type)) {
    return surface;
  }
  return (
    <>
      <WorkspaceDocumentBar tab={tab} />
      <FlexColumn sx={{ flex: 1, minHeight: 0, position: "relative" }}>
        {surface}
      </FlexColumn>
    </>
  );
};

export default memo(TabContent);
