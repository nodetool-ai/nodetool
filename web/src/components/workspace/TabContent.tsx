import React, { memo, Suspense } from "react";
import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import { LoadingSpinner } from "../ui_primitives";
import { isPageTabKey } from "./pageTabs";

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
const ChatSurface = React.lazy(() => import("./ChatSurface"));
const PageSurface = React.lazy(() => import("./PageSurface"));
const WorkspaceFileSurface = React.lazy(
  () => import("./WorkspaceFileSurface")
);
const ProjectListSurface = React.lazy(
  () => import("../projects/ProjectListSurface")
);
const ProjectOverviewSurface = React.lazy(
  () => import("../projects/ProjectOverviewSurface")
);
const NewProjectSurface = React.lazy(
  () => import("../projects/NewProjectSurface")
);

interface TabContentProps {
  tab: WorkspaceTab;
  active: boolean;
}

const surfaceFor = (tab: WorkspaceTab, active: boolean) => {
  switch (tab.type) {
    case "workflow":
      return <WorkflowEditorSurface workflowId={tab.ref} active={active} />;
    case "image":
      return <ImageSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "svg":
      return <SvgSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "sketch":
      return <SketchSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "text":
      return <TextSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "model3d":
      return <Model3DSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "audio":
      return <AudioSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "timeline":
      return <TimelineSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "storyboard":
      return (
        <StoryboardSurface refId={tab.ref} mode={tab.mode} active={active} />
      );
    case "script":
      return <ScriptSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "jsscript":
      return (
        <JsScriptSurface refId={tab.ref} mode={tab.mode} active={active} />
      );
    case "skill":
      return <SkillSurface refId={tab.ref} mode={tab.mode} active={active} />;
    case "workspace-file":
      return (
        <WorkspaceFileSurface
          refId={tab.ref}
          mode={tab.mode}
          active={active}
        />
      );
    case "application":
      return <ApplicationSurface refId={tab.ref} />;
    case "chat":
      return <ChatSurface refId={tab.ref} active={active} />;
    case "page":
      return isPageTabKey(tab.ref) ? <PageSurface pageKey={tab.ref} /> : null;
    case "project-list":
      return <ProjectListSurface />;
    case "project":
      return <ProjectOverviewSurface refId={tab.ref} />;
    case "project-new":
      return <NewProjectSurface />;
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
const TabContent = ({ tab, active }: TabContentProps) => (
  <Suspense fallback={<LoadingSpinner />}>{surfaceFor(tab, active)}</Suspense>
);

export default memo(TabContent);
