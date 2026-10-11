/**
 * DerivedShotSection
 *
 * Derive a new shot from the selected shot clip: take N frames of its footage
 * as references, add the shot after this one on the board, and put its clip on
 * a new track above this one over the same span. The render dialog opens on
 * the new shot, so the first take can start straight away; the new clip is
 * selected when the dialog closes.
 */

import React, { memo, useCallback, useState } from "react";
import { MAX_DERIVED_FRAMES } from "@nodetool-ai/timeline";

import {
  Caption,
  EditorButton,
  FlexColumn,
  FormField,
  SelectField,
  TextInput,
  SPACING
} from "../../ui_primitives";
import ShotRenderDialog from "../../storyboard/ShotRenderDialog";
import { useTimelineUIStore } from "../../../stores/timeline/TimelineUIStore";
import {
  useDeriveShotFromClip,
  type DerivedShot
} from "../../../hooks/timeline/useDeriveShotFromClip";
import { getErrorMessage } from "../../../utils/errorHandling";

const FRAME_COUNT_OPTIONS = Array.from(
  { length: MAX_DERIVED_FRAMES },
  (_, i) => ({
    value: String(i + 1),
    label: i === 0 ? "1 frame" : `${i + 1} frames`
  })
);

interface DerivedShotSectionProps {
  clipId: string;
}

const DerivedShotSectionInner = ({ clipId }: DerivedShotSectionProps) => {
  const { derive } = useDeriveShotFromClip();
  const selectClip = useTimelineUIStore((state) => state.selectClip);
  const [frameCount, setFrameCount] = useState("3");
  const [action, setAction] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [derived, setDerived] = useState<DerivedShot | null>(null);

  const handleDerive = useCallback(async () => {
    setWorking(true);
    setError(null);
    try {
      setDerived(
        await derive({ clipId, frameCount: Number(frameCount), action })
      );
      setAction("");
    } catch (failure) {
      setError(getErrorMessage(failure, "The derived shot could not be made."));
    } finally {
      setWorking(false);
    }
  }, [action, clipId, derive, frameCount]);

  const handleRenderClose = useCallback(() => {
    if (derived) {
      selectClip(derived.clipId);
    }
    setDerived(null);
  }, [derived, selectClip]);

  return (
    <FlexColumn gap={SPACING.sm} data-testid="derived-shot-section">
      <Caption color="secondary">
        Frames from this clip become the references for a new shot. Its clip
        goes on a new track above this one.
      </Caption>
      <FormField label="Reference frames">
        <SelectField
          size="small"
          label="Reference frames"
          hideLabel
          value={frameCount}
          onChange={setFrameCount}
          options={FRAME_COUNT_OPTIONS}
          disabled={working}
        />
      </FormField>
      <TextInput
        label="Description"
        value={action}
        onChange={(event) => setAction(event.target.value)}
        placeholder="What the new shot shows (defaults to this shot's)"
        multiline
        maxRows={6}
        compact
        fullWidth
        disabled={working}
      />
      <EditorButton
        fullWidth
        variant="outlined"
        onClick={() => void handleDerive()}
        disabled={working}
        data-testid="derived-shot-create"
      >
        {working ? "Taking frames…" : "Create derived shot"}
      </EditorButton>
      {error && (
        <Caption color="error" sx={{ textAlign: "center" }}>
          {error}
        </Caption>
      )}
      {derived && (
        <ShotRenderDialog
          boardId={derived.boardId}
          shot={derived.shot}
          step="clip"
          onClose={handleRenderClose}
        />
      )}
    </FlexColumn>
  );
};

export const DerivedShotSection = memo(DerivedShotSectionInner);
DerivedShotSection.displayName = "DerivedShotSection";

export default DerivedShotSection;
