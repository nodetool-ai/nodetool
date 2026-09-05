/**
 * ShotEditTable
 *
 * The twelve columns of PRD § 7.7.2, as the Edit Shot dialog's table row.
 * Every cell writes into the dialog's draft — nothing here touches the store,
 * so one `Save` upstream is one undo step (D11).
 *
 * Three cells are not free text. Scene and Shot are the derived numbering
 * (`displayNumber`), so they read rather than edit. Aspect ratio belongs to the
 * board, not the shot, and is shown with the way to change it instead of a
 * control that would silently apply to every other shot.
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import {
  Box,
  Caption,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  SelectField,
  Text,
  TextInput,
  BORDER_RADIUS,
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
  withDuration,
  withDurationSourceToggled,
  type ShotDraft
} from "./shotDraft";

interface ShotEditTableProps {
  draft: ShotDraft;
  onChange: (draft: ShotDraft) => void;
  /** `Scene N` and `Shot N`, derived from the board's one order. */
  numbering: { scene: number; shot: number };
  /** The board's ratio. Read-only here — it applies to every shot. */
  aspectRatio: string;
  /** True on a board whose linked script owns the words (PRD D9). */
  linksLines: boolean;
  /** The takes' duration, shown as the placeholder while ERT is unpinned. */
  takesDuration: number | null;
  readOnly?: boolean;
  /** Opens with the dialogue cell focused, for the card's dialogue icon. */
  focusDialogue?: boolean;
  /** Opens the linked script at this shot's first line. Set when linked. */
  onEditInScript?: () => void;
  /** Opens the board's settings, where the aspect ratio is set. */
  onOpenBoardSettings?: () => void;
}

/** One cell: its column heading above the control, on the 4px grid. */
const Cell: React.FC<{
  label: string;
  span?: number;
  children: React.ReactNode;
}> = ({ label, span = 1, children }) => (
  <FlexColumn gap={SPACING.xs} sx={{ gridColumn: `span ${span}`, minWidth: 0 }}>
    <Label sx={{ color: "text.secondary" }}>{label}</Label>
    {children}
  </FlexColumn>
);

const gridSx = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
  gap: SPACING.lg,
  alignItems: "start"
} as const;

const readOnlyCellSx = {
  minHeight: "2rem",
  display: "grid",
  alignItems: "center"
} as const;

const chipSx = {
  borderRadius: BORDER_RADIUS.pill,
  color: "text.secondary",
  borderColor: "divider",
  alignSelf: "flex-start"
} as const;

const ShotEditTableInner: React.FC<ShotEditTableProps> = ({
  draft,
  onChange,
  numbering,
  aspectRatio,
  linksLines,
  takesDuration,
  readOnly,
  focusDialogue,
  onEditInScript,
  onOpenBoardSettings
}) => {
  // Notes reads as `Add +` until there is one, so an empty column does not
  // look like a field somebody forgot to fill in.
  const [notesOpen, setNotesOpen] = useState(draft.notes.trim().length > 0);

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
    <Box sx={gridSx} data-testid="shot-edit-table">
      <Cell label="Scene">
        <Text sx={readOnlyCellSx} data-testid="cell-scene">
          {numbering.scene || "—"}
        </Text>
      </Cell>
      <Cell label="Shot">
        <Text sx={readOnlyCellSx} data-testid="cell-shot">
          {numbering.shot || "—"}
        </Text>
      </Cell>

      <Cell label="Description" span={2}>
        <TextInput
          compact
          size="small"
          multiline
          minRows={2}
          label="Description"
          hideLabel
          placeholder="What the shot shows"
          disabled={readOnly}
          value={draft.action}
          onChange={(event) => set({ action: event.target.value })}
        />
      </Cell>

      <Cell label="Dialogue" span={2}>
        {linksLines ? (
          <FlexColumn gap={SPACING.xs}>
            <Text sx={{ whiteSpace: "pre-wrap" }} data-testid="shot-dialogue-readonly">
              {draft.dialogue || "—"}
            </Text>
            <Caption color="muted">
              The script owns these words.
            </Caption>
            <EditorButton
              size="small"
              onClick={onEditInScript}
              sx={{ alignSelf: "flex-start" }}
            >
              Edit in script
            </EditorButton>
          </FlexColumn>
        ) : (
          <TextInput
            compact
            size="small"
            multiline
            minRows={2}
            label="Dialogue"
            hideLabel
            placeholder="What is said in shot"
            disabled={readOnly}
            autoFocus={focusDialogue}
            value={draft.dialogue}
            onChange={(event) => set({ dialogue: event.target.value })}
          />
        )}
      </Cell>

      <Cell label="ERT">
        <FlexColumn gap={SPACING.xs}>
          <TextInput
            compact
            size="small"
            type="number"
            label="Estimated running time in seconds"
            hideLabel
            placeholder={
              !pinned && takesDuration != null ? String(takesDuration) : "auto"
            }
            disabled={readOnly}
            value={draft.durationSeconds}
            onChange={handleDuration}
            inputProps={{
              min: 1,
              step: 1,
              "aria-label": "Estimated running time in seconds"
            }}
          />
          {linksLines && (
            <Chip
              compact
              variant="outlined"
              label={pinned ? "pinned" : "from takes"}
              sx={chipSx}
              title={
                pinned
                  ? "Length is pinned to the shot's own value. Click to take it from the lines this shot covers."
                  : "Length comes from the takes of the lines this shot covers. Click to pin it to the shot's own value."
              }
              onClick={readOnly ? undefined : handleToggleDurationSource}
            />
          )}
        </FlexColumn>
      </Cell>

      <Cell label="Size">
        <SelectField
          size="small"
          label="Size"
          hideLabel
          disabled={readOnly}
          value={draft.framing}
          onChange={(value) => set({ framing: value })}
          options={framingOptions}
        />
      </Cell>
      <Cell label="Perspective">
        <SelectField
          size="small"
          label="Perspective"
          hideLabel
          disabled={readOnly}
          value={draft.angle}
          onChange={(value) => set({ angle: value })}
          options={angleOptions}
        />
      </Cell>
      <Cell label="Movement">
        <SelectField
          size="small"
          label="Movement"
          hideLabel
          disabled={readOnly}
          value={draft.movement}
          onChange={(value) => set({ movement: value })}
          options={movementOptions}
        />
      </Cell>
      <Cell label="Equipment">
        <SelectField
          size="small"
          label="Equipment"
          hideLabel
          disabled={readOnly}
          value={draft.equipment}
          onChange={(value) => set({ equipment: value })}
          options={equipmentOptions}
        />
      </Cell>
      <Cell label="Focal length">
        <SelectField
          size="small"
          label="Focal length"
          hideLabel
          disabled={readOnly}
          value={draft.lens}
          onChange={(value) => set({ lens: value })}
          options={lensOptions}
        />
      </Cell>

      <Cell label="Aspect ratio">
        <FlexRow align="center" gap={SPACING.sm} wrap>
          <Text sx={readOnlyCellSx} data-testid="cell-aspect-ratio">
            {aspectRatio}
          </Text>
          {/* The ratio is the board's. Where no caller can open the settings
              form, say where it lives rather than offer a dead control. */}
          {onOpenBoardSettings ? (
            <EditorButton
              size="small"
              onClick={onOpenBoardSettings}
              title="Aspect ratio is set once for the whole board"
            >
              Board settings
            </EditorButton>
          ) : (
            <Caption color="muted">Set in Board settings</Caption>
          )}
        </FlexRow>
      </Cell>

      <Cell label="Notes" span={2}>
        {notesOpen ? (
          <TextInput
            compact
            size="small"
            multiline
            minRows={2}
            label="Notes"
            hideLabel
            placeholder="Anything the render should not read as direction"
            disabled={readOnly}
            autoFocus={draft.notes === ""}
            value={draft.notes}
            onChange={(event) => set({ notes: event.target.value })}
          />
        ) : (
          <EditorButton
            size="small"
            disabled={readOnly}
            onClick={() => setNotesOpen(true)}
            sx={{ alignSelf: "flex-start" }}
          >
            Add +
          </EditorButton>
        )}
      </Cell>
    </Box>
  );
};

export const ShotEditTable = memo(ShotEditTableInner);
ShotEditTable.displayName = "ShotEditTable";

export default ShotEditTable;
