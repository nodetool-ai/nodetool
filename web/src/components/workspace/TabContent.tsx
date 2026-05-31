import type { WorkspaceTab } from "../../stores/WorkspaceTabsStore";
import WorkflowEditorSurface from "./WorkflowEditorSurface";
import MiniAppPage from "../miniapps/MiniAppPage";
import ImageSurface from "./ImageSurface";
import SketchSurface from "./SketchSurface";
import TextSurface from "./TextSurface";
import Model3DSurface from "./Model3DSurface";
import AudioSurface from "./AudioSurface";
import TimelineSurface from "./TimelineSurface";

interface TabContentProps {
  tab: WorkspaceTab;
  active: boolean;
}

/**
 * Resolves a workspace tab's `(type, mode)` to its editor surface. Workflow has
 * a bespoke split (Edit → node editor, View → the MiniApp); every other type
 * delegates to a `{ refId, mode, active }` surface that wraps the existing
 * viewer/editor for that document type.
 */
const TabContent = ({ tab, active }: TabContentProps) => {
  switch (tab.type) {
    case "workflow":
      return tab.mode === "edit" ? (
        <WorkflowEditorSurface workflowId={tab.ref} active={active} />
      ) : (
        <MiniAppPage workflowId={tab.ref} embedded />
      );
    case "image":
      return <ImageSurface refId={tab.ref} mode={tab.mode} active={active} />;
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
    default: {
      // Exhaustiveness guard — a new WorkspaceTabType must add a case here.
      const exhaustive: never = tab.type;
      return exhaustive;
    }
  }
};

export default TabContent;
