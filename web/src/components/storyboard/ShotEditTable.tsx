/**
 * ShotEditTable
 *
 * The fields of PRD § 7.7.2 as the shot editor's form column: what the shot
 * shows and says first, then the camera specs. Notes and graphics sit under
 * the editor's Advanced section.
 * Every field writes into the editor's draft — nothing here touches the store,
 * so one `Save` upstream is one undo step (D11).
 *
 * Scene and Shot are the derived numbering (`displayNumber`), so the editor's
 * header shows them rather than a field here.
 */

import React, { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import type { Entity } from "@nodetool-ai/protocol";
import {
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FormField,
  SelectField,
  FormSection,
  Text,
  TextArea,
  TextInput,
  SPACING,
  Tooltip,
  type TextAreaProps
} from "../ui_primitives";
import EntityMentionTextArea from "../entities/EntityMentionTextArea";
import {
  ANGLE_OPTIONS,
  EQUIPMENT_OPTIONS,
  FRAMING_OPTIONS,
  LENS_OPTIONS,
  cameraOptions
} from "./cameraOptions";
import ShotMovementField from "./ShotMovementField";
import {
  isDurationInvalid,
  withDuration,
  withDurationSourceToggled,
  type ShotDraft
} from "./shotDraft";

interface ShotEditTableProps {
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  /** Shown under the description: the cast and places in the shot. */
  entities?: React.ReactNode;
  /** True on a board whose linked script owns the words (PRD D9). */
  linksLines: boolean;
  /** The takes' duration, shown as the placeholder while ERT is unpinned. */
  takesDuration: number | null;
  readOnly?: boolean;
  /** Opens with the dialogue cell focused, for the card's dialogue icon. */
  focusDialogue?: boolean;
  /** Opens the linked script at this shot's first line. Set when linked. */
  onEditInScript?: () => void;
  /** The model the clip renders with, so the preset picker marks its family. */
  videoModelId?: string | null;
  /**
   * Attach an entity the person picks with `@` in a prompt field. Without it
   * the fields are plain text boxes.
   */
  onMentionEntity?: (entity: Entity) => void;
}

/** Two fields to a row, as the specs read in pairs. */
const pairGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: SPACING.lg,
  alignItems: "start"
} as const;

const RENDER_MODE_OPTIONS = [
  { value: "keyframe" },
  { value: "direct" },
  { value: "reference" }
];

const chipSx = { alignSelf: "flex-start" } as const;

/** A prompt field: `@` picks an entity when the editor can attach one. */
const ShotPromptField: React.FC<
  TextAreaProps & { onMentionEntity?: (entity: Entity) => void }
> = ({ onMentionEntity, ...props }) =>
  onMentionEntity && !props.disabled ? (
    <EntityMentionTextArea {...props} onMentionEntity={onMentionEntity} />
  ) : (
    <TextArea {...props} />
  );

const ShotEditTableInner: React.FC<ShotEditTableProps> = ({
  draft,
  onChange,
  entities,
  linksLines,
  takesDuration,
  readOnly,
  focusDialogue,
  onEditInScript,
  videoModelId,
  onMentionEntity
}) => {
  const { t, i18n } = useTranslation();
  const set = useCallback(
    (patch: Partial<ShotDraft>) => onChange({ ...draft, ...patch }),
    [onChange, draft]
  );

  const handleDuration = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange(withDuration(draft, event.target.value, linksLines)),
    [onChange, draft, linksLines]
  );
  const handleToggleDurationSource = useCallback(
    () => onChange(withDurationSourceToggled(draft)),
    [onChange, draft]
  );

  const cameraLabels = useMemo<Record<string, string>>(() => ({
    "extreme wide": t("screens4_16.shotEditTable.camera.framing.extremeWide"),
    wide: t("screens4_16.shotEditTable.camera.framing.wide"),
    "medium wide": t("screens4_16.shotEditTable.camera.framing.mediumWide"),
    medium: t("screens4_16.shotEditTable.camera.framing.medium"),
    "medium close-up": t("screens4_16.shotEditTable.camera.framing.mediumCloseUp"),
    "close-up": t("screens4_16.shotEditTable.camera.framing.closeUp"),
    "extreme close-up": t("screens4_16.shotEditTable.camera.framing.extremeCloseUp"),
    "over-the-shoulder": t("screens4_16.shotEditTable.camera.framing.overTheShoulder"),
    "two-shot": t("screens4_16.shotEditTable.camera.framing.twoShot"),
    insert: t("screens4_16.shotEditTable.camera.framing.insert"),
    "eye level": t("screens4_16.shotEditTable.camera.angle.eyeLevel"),
    "low angle": t("screens4_16.shotEditTable.camera.angle.low"),
    "high angle": t("screens4_16.shotEditTable.camera.angle.high"),
    overhead: t("screens4_16.shotEditTable.camera.angle.overhead"),
    "bird's eye": t("screens4_16.shotEditTable.camera.angle.birdsEye"),
    "worm's eye": t("screens4_16.shotEditTable.camera.angle.wormsEye"),
    "dutch angle": t("screens4_16.shotEditTable.camera.angle.dutch"),
    handheld: t("screens4_16.shotEditTable.camera.equipment.handheld"),
    tripod: t("screens4_16.shotEditTable.camera.equipment.tripod"),
    steadicam: t("screens4_16.shotEditTable.camera.equipment.steadicam"),
    gimbal: t("screens4_16.shotEditTable.camera.equipment.gimbal"),
    dolly: t("screens4_16.shotEditTable.camera.equipment.dolly"),
    slider: t("screens4_16.shotEditTable.camera.equipment.slider"),
    crane: t("screens4_16.shotEditTable.camera.equipment.crane"),
    drone: t("screens4_16.shotEditTable.camera.equipment.drone"),
    macro: t("screens4_16.shotEditTable.camera.lens.macro"),
    anamorphic: t("screens4_16.shotEditTable.camera.lens.anamorphic")
  }), [t]);
  const translateOptions = useCallback(
    (suggestions: readonly string[], current: string) =>
      cameraOptions(suggestions, current).map((option) => ({
        ...option,
        label: cameraLabels[option.value] ?? option.label
      })),
    [cameraLabels]
  );
  const framingOptions = translateOptions(FRAMING_OPTIONS, draft.framing);
  const angleOptions = translateOptions(ANGLE_OPTIONS, draft.angle);
  const equipmentOptions = translateOptions(EQUIPMENT_OPTIONS, draft.equipment);
  const lensOptions = translateOptions(LENS_OPTIONS, draft.lens);
  const formatDuration = useMemo(
    () => new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language),
    [i18n.language, i18n.resolvedLanguage]
  );

  const pinned = draft.durationSource === "manual";

  return (
    <FlexColumn gap={SPACING.xl} data-testid="shot-edit-table">
      <FormSection>
        <ShotPromptField
          onMentionEntity={onMentionEntity}
          compact
          size="small"
          minRows={1}
          label={t("screens4_16.shotEditTable.description.label")}
          placeholder={t("screens4_16.shotEditTable.description.placeholder")}
          disabled={readOnly}
          value={draft.action}
          onChange={(value) => set({ action: value })}
        />
        <ShotPromptField
          onMentionEntity={onMentionEntity}
          compact
          size="small"
          minRows={1}
          label={t("screens4_16.shotEditTable.motion.label")}
          placeholder={t("screens4_16.shotEditTable.motion.placeholder")}
          disabled={readOnly}
          value={draft.motion}
          onChange={(value) => set({ motion: value })}
        />
        <ShotPromptField
          onMentionEntity={onMentionEntity}
          compact
          size="small"
          minRows={1}
          label={t("screens4_16.shotEditTable.end.label")}
          placeholder={t("screens4_16.shotEditTable.end.placeholder")}
          disabled={readOnly}
          value={draft.endState}
          onChange={(value) => set({ endState: value })}
        />
        <TextArea
          compact
          size="small"
          minRows={1}
          label={t("screens4_16.shotEditTable.sound.label")}
          placeholder={t("screens4_16.shotEditTable.sound.placeholder")}
          disabled={readOnly}
          value={draft.sound}
          onChange={(value) => set({ sound: value })}
        />

        {linksLines ? (
          <FormField label={t("screens4_16.shotEditTable.dialogue.label")} helperText={t("screens4_16.shotEditTable.dialogue.scriptOwnsWords")}>
            <FlexColumn gap={SPACING.xs}>
              <Text
                sx={{ whiteSpace: "pre-wrap" }}
                data-testid="shot-dialogue-readonly"
              >
                {draft.dialogue || "—"}
              </Text>
              <EditorButton
                size="small"
                onClick={onEditInScript}
                sx={{ alignSelf: "flex-start" }}
              >
                {t("screens4_16.shotEditTable.dialogue.editInScript")}
              </EditorButton>
            </FlexColumn>
          </FormField>
        ) : (
          <TextArea
            compact
            size="small"
            minRows={1}
            label={t("screens4_16.shotEditTable.dialogue.label")}
            placeholder={t("screens4_16.shotEditTable.dialogue.placeholder")}
            disabled={readOnly}
            autoFocus={focusDialogue}
            value={draft.dialogue}
            onChange={(value) => set({ dialogue: value })}
          />
        )}
      </FormSection>

      {entities}

      <FormSection label={t("screens4_16.shotEditTable.details")}>
        <Box sx={pairGridSx}>
          <SelectField
            size="small"
            label={t("screens4_16.shotEditTable.size")}
            disabled={readOnly}
            value={draft.framing}
            onChange={(value) => set({ framing: value })}
            options={framingOptions}
          />
          <SelectField
            size="small"
            label={t("screens4_16.shotEditTable.focalLength")}
            disabled={readOnly}
            value={draft.lens}
            onChange={(value) => set({ lens: value })}
            options={lensOptions}
          />
          <SelectField
            size="small"
            label={t("screens4_16.shotEditTable.perspective")}
            disabled={readOnly}
            value={draft.angle}
            onChange={(value) => set({ angle: value })}
            options={angleOptions}
          />
          <ShotMovementField
            label={t("screens4_16.shotEditTable.movement")}
            draft={draft}
            onChange={onChange}
            videoModelId={videoModelId}
            renderMode={draft.renderMode}
            readOnly={readOnly}
          />
          <SelectField
            size="small"
            label={t("screens4_16.shotEditTable.equipment")}
            disabled={readOnly}
            value={draft.equipment}
            onChange={(value) => set({ equipment: value })}
            options={equipmentOptions}
          />
          <FlexColumn gap={SPACING.xs}>
            <TextInput
              compact
              size="small"
              type="number"
              label={t("screens4_16.shotEditTable.duration.label")}
              placeholder={
                !pinned && takesDuration != null
                  ? formatDuration.format(takesDuration)
                  : t("screens4_16.shotEditTable.duration.modelDefault")
              }
              disabled={readOnly}
              value={draft.durationSeconds}
              onChange={handleDuration}
              errorMessage={
                isDurationInvalid(draft.durationSeconds)
                  ? t("screens4_16.shotEditTable.duration.error")
                  : undefined
              }
              inputProps={{
                min: 1,
                step: 1,
                "aria-label": t("screens4_16.shotEditTable.duration.ariaLabel")
              }}
            />
            {linksLines && (
              <Tooltip
                title={
                  pinned
                    ? t("screens4_16.shotEditTable.duration.useVoiceTakes")
                    : t("screens4_16.shotEditTable.duration.setManually")
                }
                describeChild
              >
                <Chip
                  compact
                  variant="outlined"
                  label={pinned ? t("screens4_16.shotEditTable.duration.manual") : t("screens4_16.shotEditTable.duration.fromVoiceTakes")}
                  sx={chipSx}
                  onClick={readOnly ? undefined : handleToggleDurationSource}
                />
              </Tooltip>
            )}
          </FlexColumn>
        </Box>
      </FormSection>
    </FlexColumn>
  );
};

/** The shot's title and render mode: the Advanced section's pair. */
const ShotAdvancedFieldsInner: React.FC<{
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  readOnly?: boolean;
}> = ({ draft, onChange, readOnly }) => {
  const { t } = useTranslation();
  return (
    <Box sx={pairGridSx}>
      <TextInput
        compact
        size="small"
        label={t("screens4_16.shotEditTable.shotTitle.label")}
        placeholder={t("screens4_16.shotEditTable.shotTitle.placeholder")}
        disabled={readOnly}
        value={draft.slug}
        onChange={(event) => onChange({ ...draft, slug: event.target.value })}
      />
      <SelectField
        size="small"
        label={t("screens4_16.shotEditTable.renderMode.label")}
        disabled={readOnly}
        value={draft.renderMode}
        onChange={(value) =>
          onChange({ ...draft, renderMode: value as ShotDraft["renderMode"] })
        }
        options={RENDER_MODE_OPTIONS.map((option) => ({
          value: option.value,
          label: option.value === "keyframe"
            ? t("screens4_16.shotEditTable.renderMode.options.keyframe")
            : option.value === "direct"
              ? t("screens4_16.shotEditTable.renderMode.options.direct")
              : t("screens4_16.shotEditTable.renderMode.options.reference")
        }))}
      />
    </Box>
  );
};

export const ShotAdvancedFields = memo(ShotAdvancedFieldsInner);

export const ShotEditTable = memo(ShotEditTableInner);
ShotEditTable.displayName = "ShotEditTable";

export default ShotEditTable;
