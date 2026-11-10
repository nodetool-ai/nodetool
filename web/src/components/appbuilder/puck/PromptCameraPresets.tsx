import { useState } from "react";
import { compileCameraPresets } from "@nodetool-ai/presets";
import { presetCatalog } from "../../../lib/presets/catalog";
import {
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  PresetPicker,
  SPACING
} from "../../ui_primitives";

interface PromptCameraPresetsProps {
  disabled?: boolean;
  onInsert: (text: string) => void;
}

const PromptCameraPresets = ({
  disabled,
  onInsert
}: PromptCameraPresetsProps) => {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  const insert = () => {
    const camera = compileCameraPresets(selected, {
      catalog: presetCatalog,
      mode: "image_to_video",
      modelId: ""
    });
    if (camera?.clause) {
      setOpen(false);
      onInsert(camera.clause);
    }
  };

  return (
    <>
      <EditorButton
        size="small"
        variant="outlined"
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          setSelected([]);
          setOpen(true);
        }}
      >
        Camera presets
      </EditorButton>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Camera presets"
        maxWidth="md"
        fullWidth
        actions={
          <>
            <EditorButton onClick={() => setOpen(false)}>Cancel</EditorButton>
            <EditorButton
              variant="contained"
              disabled={selected.length === 0}
              onClick={insert}
            >
              Insert camera direction
            </EditorButton>
          </>
        }
      >
        <FlexColumn gap={SPACING.md}>
          <Caption>
            Select text in the prompt before opening to replace it. Otherwise
            camera direction is inserted at the cursor.
          </Caption>
          <PresetPicker
            presets={presetCatalog.presets}
            value={selected}
            onChange={setSelected}
            filter={{ kind: "camera", mode: "image_to_video" }}
          />
        </FlexColumn>
      </Dialog>
    </>
  );
};

export default PromptCameraPresets;
