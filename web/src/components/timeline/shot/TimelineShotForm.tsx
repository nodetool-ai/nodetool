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

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Shot } from "@nodetool-ai/protocol";

import {
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  SelectField,
  TextArea,
  TextInput,
  SPACING
} from "../../ui_primitives";
import {
  ANGLE_OPTIONS,
  FRAMING_OPTIONS,
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
import ShotMovementField from "../../storyboard/ShotMovementField";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useShotVideoModelId } from "../../../hooks/storyboard/useShotVideoModelId";

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
  const { t } = useTranslation();
  const applyShotDraft = useStoryboardStore((state) => state.applyShotDraft);
  const videoModelId = useShotVideoModelId(boardId, shot);
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

  const renderModeOptions = [
    { value: "keyframe", label: t("batch2_28.form.renderModes.keyframe") },
    { value: "direct", label: t("batch2_28.form.renderModes.direct") },
    { value: "reference", label: t("batch2_28.form.renderModes.reference") }
  ];
  const localizeCameraOptions = useCallback(
    (options: ReturnType<typeof cameraOptions>) =>
      options.map((option) => ({
        ...option,
        label: option.value
          ? t(`batch2_28.form.cameraValues.${option.value}`, {
              defaultValue: option.label
            })
          : option.label
      })),
    [t]
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
  }, [
    applyShotDraft,
    boardId,
    draft,
    durationInvalid,
    original,
    readOnly,
    shot
  ]);

  const handleRevert = useCallback(() => setDraft(original), [original]);

  const framingOptions = useMemo(
    () => localizeCameraOptions(cameraOptions(FRAMING_OPTIONS, draft.framing)),
    [draft.framing, localizeCameraOptions]
  );
  const angleOptions = useMemo(
    () => localizeCameraOptions(cameraOptions(ANGLE_OPTIONS, draft.angle)),
    [draft.angle, localizeCameraOptions]
  );

  return (
    <FlexColumn gap={SPACING.lg} data-testid="timeline-shot-form">
      <TextInput
        label={t("batch2_28.form.name")}
        value={draft.slug}
        onChange={(event) => set({ slug: event.target.value })}
        disabled={readOnly}
        compact
        fullWidth
      />
      <TextArea
        label={t("batch2_28.form.description")}
        value={draft.action}
        onChange={(value) => set({ action: value })}
        disabled={readOnly}
        placeholder={t("batch2_28.form.descriptionPlaceholder")}
        minRows={1}
        maxRows={8}
        compact
        fullWidth
      />
      <TextArea
        label={t("batch2_28.form.dialogue")}
        value={draft.dialogue}
        onChange={(value) => set({ dialogue: value })}
        disabled={readOnly}
        maxRows={4}
        compact
        fullWidth
      />
      <TextArea
        label={t("batch2_28.form.motion")}
        value={draft.motion}
        onChange={(value) => set({ motion: value })}
        disabled={readOnly}
        placeholder={t("batch2_28.form.motionPlaceholder")}
        maxRows={4}
        compact
        fullWidth
      />
      <TextInput
        label={t("batch2_28.form.sound")}
        value={draft.sound}
        onChange={(event) => set({ sound: event.target.value })}
        disabled={readOnly}
        compact
        fullWidth
      />
      <SelectField
        size="small"
        label={t("batch2_28.form.size")}
        disabled={readOnly}
        value={draft.framing}
        onChange={(value) => set({ framing: value })}
        options={framingOptions}
      />
      <SelectField
        size="small"
        label={t("batch2_28.form.perspective")}
        disabled={readOnly}
        value={draft.angle}
        onChange={(value) => set({ angle: value })}
        options={angleOptions}
      />
      <ShotMovementField
        label={t("batch2_28.form.movement")}
        draft={draft}
        onChange={setDraft}
        videoModelId={videoModelId}
        renderMode={draft.renderMode}
        readOnly={readOnly}
      />
      <SelectField
        size="small"
        label={t("batch2_28.form.renderFrom")}
        disabled={readOnly}
        value={draft.renderMode}
        onChange={(value) =>
          set({ renderMode: value as ShotDraft["renderMode"] })
        }
        options={renderModeOptions}
      />
      <TextInput
        label={t("batch2_28.form.length")}
        value={draft.durationSeconds}
        onChange={(event) => set({ durationSeconds: event.target.value })}
        disabled={readOnly}
        errorMessage={
          durationInvalid ? t("batch2_28.form.durationError") : undefined
        }
        inputProps={{ inputMode: "decimal" }}
        compact
        fullWidth
      />
      {!readOnly && (
        <FlexRow gap={SPACING.sm} justify="flex-end" align="center">
          {dirty && (
            <Caption color="secondary">
              {t("batch2_28.form.unsavedChanges")}
            </Caption>
          )}
          <EditorButton onClick={handleRevert} disabled={!dirty}>
            {t("batch2_28.form.revert")}
          </EditorButton>
          <EditorButton
            variant="contained"
            onClick={handleSave}
            disabled={!dirty || durationInvalid}
            data-testid="timeline-shot-form-save"
          >
            {t("batch2_28.form.save")}
          </EditorButton>
        </FlexRow>
      )}
    </FlexColumn>
  );
};

export const TimelineShotForm = memo(TimelineShotFormInner);
TimelineShotForm.displayName = "TimelineShotForm";

export default TimelineShotForm;
