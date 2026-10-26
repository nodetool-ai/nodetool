/**
 * ConnectedDocumentBar — the sketch editor's slots of the workspace document
 * bar: the autosave status, Undo/Redo, the Layout menu and the assistant
 * toggle, then the host's primary action, Generate and the ⋮ menu.
 *
 * The host draws the bar itself (`render`), so it owns the title and rename.
 * The tool settings stay in the tool top bar over the canvas (D7).
 */

import { memo } from "react";

import {
  SaveStatus,
  UndoRedoButtons,
  type DocumentBarRender,
  type SaveStatusValue
} from "../../ui_primitives";
import { useSketchStore } from "../state";
import { useSketchSessionStore } from "../../../stores/sketch/SketchSessionStore";
import {
  useEditorActionParts,
  type ConnectedEditorActionsProps
} from "./ConnectedEditorActions";

export interface ConnectedDocumentBarProps extends ConnectedEditorActionsProps {
  render: DocumentBarRender;
  onUndo: () => void;
  onRedo: () => void;
}

export const ConnectedDocumentBar = memo(function ConnectedDocumentBar({
  render,
  onUndo,
  onRedo,
  ...actionProps
}: ConnectedDocumentBarProps) {
  const parts = useEditorActionParts(actionProps);
  const canUndo = useSketchStore((s) => s.canUndo());
  const canRedo = useSketchStore((s) => s.canRedo());
  const saveState = useSketchSessionStore((s) => s.saveState);
  const status: SaveStatusValue =
    saveState === "saving" ? "saving" : saveState === "error" ? "error" : "saved";

  return (
    <>
      {render({
        status: <SaveStatus state={status} />,
        history: (
          <UndoRedoButtons
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        ),
        view: (
          <>
            {parts.layoutMenu}
            {parts.assistant}
          </>
        ),
        actions: (
          <>
            {parts.inline}
            {parts.generate}
            {parts.more}
          </>
        )
      })}
      {parts.dialogs}
    </>
  );
});
