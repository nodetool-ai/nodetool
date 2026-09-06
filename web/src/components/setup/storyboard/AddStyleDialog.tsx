/**
 * The `Add your own style` picker (PRD § 7.3).
 *
 * Up to three references, then one model call that writes the descriptor. The
 * references are shown by name rather than as thumbnails: they are local files
 * with no asset behind them yet, and a picture on this surface would mean
 * rendering a locator the media primitives have nothing to resolve.
 *
 * The call costs money, so the dialog says which model it goes to and what it
 * is likely to cost before it is made, and the confirm button carries the
 * dialog's own loading and disabled state — a button that only changed its
 * words while saving took a second press and made a second call (F18).
 */

import React, { Suspense, lazy, useCallback, useRef, useState } from "react";

import {
  AlertBanner,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text
} from "../../ui_primitives";
import type { GenerationModel } from "../generationEstimate";
import { MAX_STYLE_REFERENCES, STYLE_ACCEPT } from "./useCustomStyle";

// The estimate pulls in the provider price tables; nothing needs them until
// the dialog is open.
const GenerationSummary = lazy(() => import("../GenerationSummary"));

/** What the descriptor call is allowed to answer with. */
const STYLE_MAX_OUTPUT_TOKENS = 1024;

export interface AddStyleDialogProps {
  open: boolean;
  saving: boolean;
  error: string | null;
  /** The model that reads the references, for the estimate above the button. */
  model: GenerationModel | null;
  onClose: () => void;
  /** Resolves true when the style was saved and applied. */
  onSubmit: (files: readonly File[]) => Promise<boolean>;
}

export const AddStyleDialog: React.FC<AddStyleDialogProps> = ({
  open,
  saving,
  error,
  model,
  onClose,
  onSubmit
}) => {
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  // Which reference a pick replaces, or null when it is appended.
  const replacing = useRef<number | null>(null);

  const handlePicked = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const picked = Array.from(event.target.files ?? []);
      event.target.value = "";
      const at = replacing.current;
      replacing.current = null;
      if (picked.length === 0) {
        return;
      }
      setFiles((current) => {
        if (at !== null) {
          const next = [...current];
          next[at] = picked[0];
          return next;
        }
        return [...current, ...picked].slice(0, MAX_STYLE_REFERENCES);
      });
    },
    []
  );

  const openPicker = useCallback((at: number | null) => {
    replacing.current = at;
    input.current?.click();
  }, []);

  const handleAdd = useCallback(() => openPicker(null), [openPicker]);

  const handleRemove = useCallback((at: number) => {
    setFiles((current) => current.filter((_, index) => index !== at));
  }, []);

  const handleSubmit = useCallback(async () => {
    if (await onSubmit(files)) {
      setFiles([]);
      onClose();
    }
  }, [files, onClose, onSubmit]);

  // Cancelling drops the references. Leaving them behind meant reopening the
  // dialog on a set the creator had already walked away from (F18).
  const handleCancel = useCallback(() => {
    setFiles([]);
    onClose();
  }, [onClose]);

  return (
    <Dialog
      open={open}
      onClose={handleCancel}
      title="Add your own style"
      showActions
      onConfirm={handleSubmit}
      confirmText={saving ? "Reading your references…" : "Add style"}
      isLoading={saving}
      confirmDisabled={saving || files.length === 0}
      cancelDisabled={saving}
      cancelText="Cancel"
      onCancel={handleCancel}
    >
      <FlexColumn gap={GAP.comfortable}>
        <Text size="normal" color="secondary">
          One to three pictures of the look you want. We describe how they are
          made — never who or what is in them — and save it as your own style.
        </Text>
        <EditorButton
          onClick={handleAdd}
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
            {files.map((file, index) => (
              <FlexRow
                key={`${file.name}:${index}`}
                component="li"
                gap={GAP.normal}
                align="center"
                justify="space-between"
                wrap
              >
                <Caption component="span" color="secondary">
                  {file.name}
                </Caption>
                <FlexRow gap={GAP.tight}>
                  <EditorButton
                    variant="text"
                    size="small"
                    disabled={saving}
                    aria-label={`Replace ${file.name}`}
                    onClick={() => openPicker(index)}
                  >
                    Replace
                  </EditorButton>
                  <EditorButton
                    variant="text"
                    size="small"
                    disabled={saving}
                    aria-label={`Remove ${file.name}`}
                    onClick={() => handleRemove(index)}
                  >
                    Remove
                  </EditorButton>
                </FlexRow>
              </FlexRow>
            ))}
          </FlexColumn>
        ) : null}
        <Suspense
          fallback={<Caption color="secondary">Loading estimate…</Caption>}
        >
          <GenerationSummary
            result="Describe your references as a style you can reuse"
            next="Saves the style and applies it to this board. No stills are rendered here."
            model={model}
            brief=""
            maxOutputTokens={STYLE_MAX_OUTPUT_TOKENS}
          />
        </Suspense>
        {error ? <AlertBanner severity="error">{error}</AlertBanner> : null}
      </FlexColumn>
    </Dialog>
  );
};

export default AddStyleDialog;
