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
import {
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FormField,
  SelectField,
  FormSection,
  Text,
  TextInput,
  SPACING
} from "../ui_primitives";
import {
  ANGLE_OPTIONS,
  EQUIPMENT_OPTIONS,
  FRAMING_OPTIONS,
  LENS_OPTIONS,
  MOVEMENT_OPTIONS,
  cameraOptions
} from "./cameraOptions";
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
}

/** Two fields to a row, as the specs read in pairs. */
const pairGridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: SPACING.lg,
  alignItems: "start"
} as const;

const RENDER_MODE_OPTIONS = [
  { value: "keyframe", label: "Keyframe" },
  { value: "direct", label: "Direct" },
  { value: "reference", label: "Reference" }
];

const chipSx = { alignSelf: "flex-start" } as const;

const ShotEditTableInner: React.FC<ShotEditTableProps> = ({
  draft,
  onChange,
  entities,
  linksLines,
  takesDuration,
  readOnly,
  focusDialogue,
  onEditInScript
}) => {
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
  const equipmentOptions = useMemo(
    () => cameraOptions(EQUIPMENT_OPTIONS, draft.equipment),
    [draft.equipment]
  );
  const lensOptions = useMemo(
    () => cameraOptions(LENS_OPTIONS, draft.lens),
    [draft.lens]
  );

  const pinned = draft.durationSource === "manual";

  return (
    <FlexColumn gap={SPACING.xl} data-testid="shot-edit-table">
      <FormSection>
        <TextInput
          compact
          size="small"
          multiline
          minRows={1}
          label="Description"
          placeholder="What the shot shows"
          disabled={readOnly}
          value={draft.action}
          onChange={(event) => set({ action: event.target.value })}
        />
        <TextInput
          compact
          size="small"
          multiline
          minRows={1}
          label="Shot motion"
          placeholder="What moves, and how the camera moves, over the clip"
          disabled={readOnly}
          value={draft.motion}
          onChange={(event) => set({ motion: event.target.value })}
        />
        <TextInput
          compact
          size="small"
          multiline
          minRows={1}
          label="End"
          placeholder="The picture the shot ends on"
          disabled={readOnly}
          value={draft.endState}
          onChange={(event) => set({ endState: event.target.value })}
        />
        <TextInput
          compact
          size="small"
          multiline
          minRows={1}
          label="Sound"
          placeholder="What is heard"
          disabled={readOnly}
          value={draft.sound}
          onChange={(event) => set({ sound: event.target.value })}
        />

        {linksLines ? (
          <FormField label="Dialogue" helperText="The script owns these words.">
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
                Edit in script
              </EditorButton>
            </FlexColumn>
          </FormField>
        ) : (
          <TextInput
            compact
            size="small"
            multiline
            minRows={1}
            label="Dialogue"
            placeholder="What is said in shot"
            disabled={readOnly}
            autoFocus={focusDialogue}
            value={draft.dialogue}
            onChange={(event) => set({ dialogue: event.target.value })}
          />
        )}
      </FormSection>

      {entities}

      <FormSection label="Shot details">
        <Box sx={pairGridSx}>
          <SelectField
            size="small"
            label="Size"
            disabled={readOnly}
            value={draft.framing}
            onChange={(value) => set({ framing: value })}
            options={framingOptions}
          />
          <SelectField
            size="small"
            label="Focal length"
            disabled={readOnly}
            value={draft.lens}
            onChange={(value) => set({ lens: value })}
            options={lensOptions}
          />
          <SelectField
            size="small"
            label="Perspective"
            disabled={readOnly}
            value={draft.angle}
            onChange={(value) => set({ angle: value })}
            options={angleOptions}
          />
          <SelectField
            size="small"
            label="Movement"
            disabled={readOnly}
            value={draft.movement}
            onChange={(value) => set({ movement: value })}
            options={movementOptions}
          />
          <SelectField
            size="small"
            label="Equipment"
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
              label="Duration (seconds)"
              placeholder={
                !pinned && takesDuration != null
                  ? String(takesDuration)
                  : "Model default"
              }
              disabled={readOnly}
              value={draft.durationSeconds}
              onChange={handleDuration}
              errorMessage={
                isDurationInvalid(draft.durationSeconds)
                  ? "Enter a length above 0 seconds"
                  : undefined
              }
              inputProps={{
                min: 1,
                step: 1,
                "aria-label": "Duration in seconds"
              }}
            />
            {linksLines && (
              <Chip
                compact
                variant="outlined"
                label={pinned ? "Set by hand" : "From voice takes"}
                sx={chipSx}
                title={
                  pinned
                    ? "The duration is the value you typed. Click to use the length of the voice takes for this shot's lines."
                    : "The duration is the length of the voice takes for this shot's lines. Click to type your own value."
                }
                onClick={readOnly ? undefined : handleToggleDurationSource}
              />
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
}> = ({ draft, onChange, readOnly }) => (
  <Box sx={pairGridSx}>
    <TextInput
      compact
      size="small"
      label="Shot title"
      placeholder="Untitled shot"
      disabled={readOnly}
      value={draft.slug}
      onChange={(event) => onChange({ ...draft, slug: event.target.value })}
    />
    <SelectField
      size="small"
      label="Render mode"
      disabled={readOnly}
      value={draft.renderMode}
      onChange={(value) =>
        onChange({ ...draft, renderMode: value as ShotDraft["renderMode"] })
      }
      options={RENDER_MODE_OPTIONS}
    />
  </Box>
);

export const ShotAdvancedFields = memo(ShotAdvancedFieldsInner);

export const ShotEditTable = memo(ShotEditTableInner);
ShotEditTable.displayName = "ShotEditTable";

export default ShotEditTable;
