/**
 * TimelineShotForm
 *
 * The shot form for the timeline's Shot tab: one narrow column of the fields a
 * take is rendered from — description, dialogue, motion, sound, camera, length
 * and render mode. It edits the same draft as the board's Edit Shot panel
 * (`shotDraft`), so the two forms save the same patch: only the fields changed
 * here are written, in one `applyShotDraft`, and a field someone else changed
 * meanwhile keeps their value unless it was also changed here.
 *
 * Scene placement, lighting, graphics and script lines stay on the board.
 */

import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  SelectField,
  TextInput,
  SPACING
} from "../../ui_primitives";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
  MOVEMENT_OPTIONS,
  cameraOptions
} from "../../storyboard/cameraOptions";
import {
  changedDraftKeys,
  draftFromShot,
  isDraftDirty,
  isDurationInvalid,
  shotPatchFromChangedDraft,
  type ShotDraft
} from "../../storyboard/shotDraft";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";

const RENDER_MODE_OPTIONS = [
  { value: "keyframe", label: "Animate a still" },
  { value: "direct", label: "From the prompt" },
  { value: "reference", label: "From references" }
];

interface TimelineShotFormProps {
  boardId: string;
  shot: Shot;
  readOnly?: boolean;
}

const TimelineShotFormInner = ({
  boardId,
  shot,
  readOnly
}: TimelineShotFormProps) => {
  const applyShotDraft = useStoryboardStore((state) => state.applyShotDraft);
  const scene = useStoryboardStore(
    (state) =>
      state.boards[boardId]?.screenplay?.scenes?.find(
        (candidate) => candidate.id === shot.scene_id
      ) ?? null
  );

  // Reset only when the form moves to another shot: a render landing behind
  // the form rewrites the shot object and must not wipe what is being typed.
  const [original, setOriginal] = useState<ShotDraft>(() =>
    draftFromShot(shot, scene)
  );
  const [draft, setDraft] = useState<ShotDraft>(original);
  const draftedFor = useRef(shot.id);
  useEffect(() => {
    if (draftedFor.current === shot.id) {
      return;
    }
    draftedFor.current = shot.id;
    const next = draftFromShot(shot, scene);
    setOriginal(next);
    setDraft(next);
  }, [shot, scene]);

  const set = useCallback(
    (patch: Partial<ShotDraft>) => setDraft((prev) => ({ ...prev, ...patch })),
    []
  );

  const dirty = isDraftDirty(draft, original);
  const durationInvalid = isDurationInvalid(draft.durationSeconds);

  const handleSave = useCallback(() => {
    if (durationInvalid || readOnly) {
      return;
    }
    const changed = changedDraftKeys(draft, original);
    if (changed.length === 0) {
      return;
    }
    applyShotDraft(boardId, shot.id, {
      shot: {
        ...shotPatchFromChangedDraft(draft, original, shot),
        // A length typed here pins the shot, as it does on the board.
        ...(changed.includes("durationSeconds") && {
          duration_source: "manual" as const
        })
      },
      sceneId: shot.scene_id ?? null
    });
    setOriginal(draft);
  }, [applyShotDraft, boardId, draft, durationInvalid, original, readOnly, shot]);

  const handleRevert = useCallback(() => setDraft(original), [original]);

  const framingOptions = useMemo(
    () => cameraOptions(FRAMING_OPTIONS, draft.framing),
    [draft.framing]
  );
  const angleOptions = useMemo(
    () => cameraOptions(ANGLE_OPTIONS, draft.angle),
    [draft.angle]
  );
  const movementOptions = useMemo(
    () => cameraOptions(MOVEMENT_OPTIONS, draft.movement),
    [draft.movement]
  );

  return (
    <FlexColumn gap={SPACING.sm} data-testid="timeline-shot-form">
      <TextInput
        label="Name"
        value={draft.slug}
        onChange={(event) => set({ slug: event.target.value })}
        disabled={readOnly}
        compact
        fullWidth
      />
      <TextInput
        label="Description"
        value={draft.action}
        onChange={(event) => set({ action: event.target.value })}
        disabled={readOnly}
        placeholder="What the shot shows"
        multiline
        minRows={2}
        maxRows={8}
        compact
        fullWidth
      />
      <TextInput
        label="Dialogue"
        value={draft.dialogue}
        onChange={(event) => set({ dialogue: event.target.value })}
        disabled={readOnly}
        multiline
        maxRows={4}
        compact
        fullWidth
      />
      <TextInput
        label="Motion"
        value={draft.motion}
        onChange={(event) => set({ motion: event.target.value })}
        disabled={readOnly}
        placeholder="What moves, and how the camera moves"
        multiline
        maxRows={4}
        compact
        fullWidth
      />
      <TextInput
        label="Sound"
        value={draft.sound}
        onChange={(event) => set({ sound: event.target.value })}
        disabled={readOnly}
        compact
        fullWidth
      />
      <FormField label="Size">
        <SelectField
          size="small"
          label="Size"
          hideLabel
          disabled={readOnly}
          value={draft.framing}
          onChange={(value) => set({ framing: value })}
          options={framingOptions}
        />
      </FormField>
      <FormField label="Perspective">
        <SelectField
          size="small"
          label="Perspective"
          hideLabel
          disabled={readOnly}
          value={draft.angle}
          onChange={(value) => set({ angle: value })}
          options={angleOptions}
        />
      </FormField>
      <FormField label="Movement">
        <SelectField
          size="small"
          label="Movement"
          hideLabel
          disabled={readOnly}
          value={draft.movement}
          onChange={(value) => set({ movement: value })}
          options={movementOptions}
        />
      </FormField>
      <FormField label="Render from">
        <SelectField
          size="small"
          label="Render from"
          hideLabel
          disabled={readOnly}
          value={draft.renderMode}
          onChange={(value) =>
            set({ renderMode: value as ShotDraft["renderMode"] })
          }
          options={RENDER_MODE_OPTIONS}
        />
      </FormField>
      <TextInput
        label="Length (s)"
        value={draft.durationSeconds}
        onChange={(event) => set({ durationSeconds: event.target.value })}
        disabled={readOnly}
        error={durationInvalid}
        helperText={durationInvalid ? "Enter a length in seconds." : undefined}
        inputProps={{ inputMode: "decimal" }}
        compact
        fullWidth
      />
      {!readOnly && (
        <FlexRow gap={SPACING.sm} justify="flex-end" align="center">
          {dirty && <Caption color="secondary">Unsaved changes</Caption>}
          <EditorButton onClick={handleRevert} disabled={!dirty}>
            Revert
          </EditorButton>
          <EditorButton
            variant="contained"
            onClick={handleSave}
            disabled={!dirty || durationInvalid}
            data-testid="timeline-shot-form-save"
          >
            Save
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export const TimelineShotForm = memo(TimelineShotFormInner);
TimelineShotForm.displayName = "TimelineShotForm";

export default TimelineShotForm;
