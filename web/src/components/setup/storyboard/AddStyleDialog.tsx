/**
 * The `Add your own style` picker (PRD § 7.3).
 *
 * Up to three references, then one model call that writes the descriptor. The
 * references are shown by name rather than as thumbnails: they are local files
 * with no asset behind them yet, and a picture on this surface would mean
 * rendering a locator the media primitives have nothing to resolve.
 */

import React, { useCallback, useRef, useState } from "react";

import {
  AlertBanner,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  GAP,
  Text
} from "../../ui_primitives";
import { MAX_STYLE_REFERENCES, STYLE_ACCEPT } from "./useCustomStyle";

export interface AddStyleDialogProps {
  open: boolean;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  /** Resolves true when the style was saved and applied. */
  onSubmit: (files: readonly File[]) => Promise<boolean>;
}

export const AddStyleDialog: React.FC<AddStyleDialogProps> = ({
  open,
  saving,
  error,
  onClose,
  onSubmit
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);

  const handlePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      setFiles((current) =>
        [...current, ...picked].slice(0, MAX_STYLE_REFERENCES)
      );
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    if (await onSubmit(files)) {
      setFiles([]);
      onClose();
    }
  }, [files, onClose, onSubmit]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add your own style"
      showActions
      onConfirm={handleSubmit}
      confirmText={saving ? "Reading your references…" : "Add style"}
      cancelText="Cancel"
      onCancel={onClose}
    >
      <FlexColumn gap={GAP.comfortable}>
        <Text size="normal" color="secondary">
          One to three pictures of the look you want. We describe how they are
          made — never who or what is in them — and save it as your own style.
        </Text>
        <EditorButton
          onClick={() => input.current?.click()}
          disabled={saving || files.length >= MAX_STYLE_REFERENCES}
        >
          Choose references
        </EditorButton>
        <input
          type="file"
          hidden
          multiple
          ref={input}
          accept={STYLE_ACCEPT}
          aria-label="Reference images"
          onChange={handlePicked}
        />
        {files.length > 0 ? (
          <FlexColumn gap={GAP.tight} component="ul">
            {files.map((file) => (
              <Caption key={file.name} component="li" color="secondary">
                {file.name}
              </Caption>
            ))}
          </FlexColumn>
        ) : null}
        {error ? <AlertBanner severity="error">{error}</AlertBanner> : null}
      </FlexColumn>
    </Dialog>
  );
};

export default AddStyleDialog;
