import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import StandaloneSketchEditor from "../sketch/StandaloneSketchEditor";

interface SketchSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

const SketchSurface = ({ refId, active }: SketchSurfaceProps) => {
  return <StandaloneSketchEditor documentId={refId} active={active} />;
};

export default SketchSurface;
