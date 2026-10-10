/**
 * The workspace's image tab.
 *
 * The editor always mounts; the guided image flow renders over it while the
 * document's setup stage says so (PRD § 10, criterion 2). A document with no
 * `setup` — every document made before the flow — reads `done` and opens as
 * the editor, exactly as it did.
 */

import { useState } from "react";
import type { WorkspaceTabMode } from "../../stores/WorkspaceTabsStore";
import StandaloneSketchEditor from "../sketch/StandaloneSketchEditor";
import ImageSetupOverlay from "../setup/image/ImageSetupOverlay";

interface SketchSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
}

const SketchSurface = ({ refId, active }: SketchSurfaceProps) => {
  // While the flow covers the editor, the editor's window shortcuts would act
  // on the hidden document, so they are suspended until it hands back.
  const [covered, setCovered] = useState(false);
  return (
    <StandaloneSketchEditor
      documentId={refId}
      active={active}
      suspendKeyboardShortcuts={covered}
      overlay={<ImageSetupOverlay onCoveringChange={setCovered} />}
    />
  );
};

export default SketchSurface;
