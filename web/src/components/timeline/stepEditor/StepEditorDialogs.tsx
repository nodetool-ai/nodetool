/**
 * The Step Editor's small input dialogs: one number, confirmed or cancelled.
 * They serve Other CC, New Note Lane, Scale Values and Set to Value.
 */

import React, { memo, useEffect, useState } from "react";

import { Dialog, TextInput } from "../../ui_primitives";

interface NumberDialogProps {
  open: boolean;
  title: string;
  label: string;
  confirmText: string;
  cancelText: string;
  initial: number;
  min: number;
  max: number;
  onConfirm: (value: number) => void;
  onClose: () => void;
}

export const NumberDialog: React.FC<NumberDialogProps> = memo(
  ({ open, title, label, confirmText, cancelText, initial, min, max, onConfirm, onClose }) => {
    const [text, setText] = useState(String(initial));
    useEffect(() => {
      if (open) setText(String(initial));
    }, [open, initial]);
    const parsed = Math.round(Number(text));
    const valid = text.trim() !== "" && Number.isFinite(parsed);
    const value = Math.min(max, Math.max(min, parsed));
    const confirm = () => {
      if (!valid) return;
      onConfirm(value);
      onClose();
    };
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={title}
        onConfirm={confirm}
        onCancel={onClose}
        confirmText={confirmText}
        cancelText={cancelText}
        confirmDisabled={!valid}
        minWidth={280}
      >
        <TextInput
          label={label}
          type="number"
          autoFocus
          value={text}
          inputProps={{ min, max, step: 1 }}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              confirm();
            }
          }}
        />
      </Dialog>
    );
  }
);

NumberDialog.displayName = "NumberDialog";
