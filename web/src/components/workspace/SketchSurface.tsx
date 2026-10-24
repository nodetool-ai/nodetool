/**
 * The workspace's image tab.
 *
 * The editor always mounts; the guided image flow renders over it while the
 * document's setup stage says so (PRD § 10, criterion 2). A document with no
 * `setup` — every document made before the flow — reads `done` and opens as
 * the editor, exactly as it did.
 *
 * The editor draws the tab's document bar: autosave status, Undo/Redo, the
 * Layout menu and the assistant, then Export PNG, Generate and ⋮.
 */

import { useState } from "react";
import type {
  WorkspaceTab,
  WorkspaceTabMode
} from "../../stores/WorkspaceTabsStore";
import StandaloneSketchEditor from "../sketch/StandaloneSketchEditor";
import ImageSetupOverlay from "../setup/image/ImageSetupOverlay";
import { workspaceDocumentBar } from "./documentBarParts";

interface SketchSurfaceProps {
  refId: string;
  mode: WorkspaceTabMode;
  active: boolean;
  /** The workspace tab, whose document bar tops the surface. */
  tab: WorkspaceTab;
}

const SketchSurface = ({ refId, active, tab }: SketchSurfaceProps) => {
  // While the flow covers the editor, the editor's window shortcuts would act
  // on the hidden document, so they are suspended until it hands back.
  const [covered, setCovered] = useState(false);
  return (
    <StandaloneSketchEditor
      documentId={refId}
      active={active}
      suspendKeyboardShortcuts={covered}
      overlay={<ImageSetupOverlay onCoveringChange={setCovered} />}
      documentBar={workspaceDocumentBar(tab)}
    />
  );
};

export default SketchSurface;
