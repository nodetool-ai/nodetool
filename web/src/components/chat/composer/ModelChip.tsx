/**
 * ModelChip — the composer's model select: the chip, its open state, and the
 * picker dialog that matches the kind of model being chosen.
 *
 * `openRef` exists because a send with nothing picked is refused and has to
 * open this picker; the composer holds that handle rather than a copy of the
 * open flag.
 */
import React, {
  useCallback,
  useImperativeHandle,
  useRef,
  useState
} from "react";

import MediaControlChip from "./MediaControlChip";
import ImageModelMenuDialog from "../../model_menu/ImageModelMenuDialog";
import VideoModelMenuDialog from "../../model_menu/VideoModelMenuDialog";
import TTSModelMenuDialog from "../../model_menu/TTSModelMenuDialog";
import LanguageModelMenuDialog from "../../model_menu/LanguageModelMenuDialog";
import type {
  ImageModelTask,
  VideoModelTask
} from "../../../hooks/useModelsByProvider";
import type {
  ImageModel,
  LanguageModel,
  TTSModel,
  VideoModel
} from "../../../stores/ApiTypes";

/** The model chip takes the width the other chips in the row leave, up to
 *  this, rather than truncating at a fixed width while the row runs empty. */
export const MODEL_CHIP_MAX_WIDTH = 320;

export type ModelPicker =
  | { kind: "image"; task: ImageModelTask; onPick: (model: ImageModel) => void }
  | { kind: "video"; task: VideoModelTask; onPick: (model: VideoModel) => void }
  | { kind: "tts"; onPick: (model: TTSModel) => void }
  | {
      kind: "language";
      allowedProviders?: string[];
      requireToolSupport?: boolean;
      onPick: (model: LanguageModel) => void;
    };

/** What the composer calls when a send is refused for want of a model. */
export interface ModelPickerHandle {
  open: () => void;
}

interface ModelChipProps {
  icon: React.ReactNode;
  label: string;
  title?: string;
  picker: ModelPicker;
  openRef?: React.Ref<ModelPickerHandle>;
}

export function ModelChip({
  icon,
  label,
  title,
  picker,
  openRef
}: ModelChipProps) {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useImperativeHandle(openRef, () => ({ open: () => setOpen(true) }), []);

  const chip = (
    <MediaControlChip
      ref={anchorRef}
      icon={icon}
      label={label}
      title={title}
      active={open}
      onClick={() => setOpen(true)}
      showChevron
      truncate
      grow
      maxWidth={MODEL_CHIP_MAX_WIDTH}
    />
  );

  if (picker.kind === "image") {
    return (
      <>
        {chip}
        <ImageModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={(model) => {
            picker.onPick(model);
            setOpen(false);
          }}
          task={picker.task}
        />
      </>
    );
  }

  if (picker.kind === "video") {
    return (
      <>
        {chip}
        <VideoModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={(model) => {
            picker.onPick(model);
            setOpen(false);
          }}
          task={picker.task}
        />
      </>
    );
  }

  if (picker.kind === "tts") {
    return (
      <>
        {chip}
        <TTSModelMenuDialog
          open={open}
          anchorEl={anchorRef.current}
          onClose={close}
          onModelChange={(model) => {
            picker.onPick(model);
            setOpen(false);
          }}
        />
      </>
    );
  }

  return (
    <>
      {chip}
      <LanguageModelMenuDialog
        open={open}
        anchorEl={anchorRef.current}
        onClose={close}
        onModelChange={(model) => {
          picker.onPick(model);
          setOpen(false);
        }}
        allowedProviders={picker.allowedProviders}
        requireToolSupport={picker.requireToolSupport}
      />
    </>
  );
}

export default ModelChip;
