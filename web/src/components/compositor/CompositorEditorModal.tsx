/** @jsxImportSource @emotion/react */
/**
 * CompositorEditorModal — fullscreen portal wrapper around CompositorEditor.
 *
 * Edits are written live to the node props by the editor's callbacks, so there
 * is no separate save step: closing simply dismisses the modal.
 */

import React, { memo } from "react";
import ReactDOM from "react-dom";
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";

import { CloseButton, Text } from "../ui_primitives";
import CompositorEditor, {
  type CompositorEditorProps
} from "./CompositorEditor";

export interface CompositorEditorModalProps extends CompositorEditorProps {
  open: boolean;
  title?: string;
  onClose: () => void;
}

const styles = (theme: Theme) =>
  css({
    position: "fixed",
    inset: 0,
    zIndex: 1400,
    display: "flex",
    flexDirection: "column",
    background: theme.vars.palette.grey[900],
    ".compositor-modal-header": {
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1),
      padding: `${theme.spacing(0.5)} ${theme.spacing(1.5)}`,
      background: theme.vars.palette.grey[800],
      borderBottom: `1px solid ${theme.vars.palette.grey[700]}`,
      minHeight: 40
    },
    ".compositor-modal-body": {
      flex: 1,
      minHeight: 0,
      display: "flex"
    }
  });

const CompositorEditorModalInner: React.FC<CompositorEditorModalProps> = ({
  open,
  title = "Compositor",
  onClose,
  ...editorProps
}) => {
  const theme = useTheme();
  if (!open) return null;

  return ReactDOM.createPortal(
    <div css={styles(theme)} className="compositor-modal">
      <div className="compositor-modal-header">
        <Text sx={{ fontWeight: 500, mr: "auto" }}>{title}</Text>
        <CloseButton onClick={onClose} tooltip="Close compositor editor" />
      </div>
      <div className="compositor-modal-body">
        <CompositorEditor {...editorProps} />
      </div>
    </div>,
    window.document.body
  );
};

export const CompositorEditorModal = memo(CompositorEditorModalInner);
CompositorEditorModal.displayName = "CompositorEditorModal";

export default CompositorEditorModal;
