/**
 * Step 3 of the storyboard flow — aspect ratio and art style (PRD § 7.3).
 *
 * The step body is a picker and nothing else; the primary button lives on the
 * `SetupFlow` shell. `useLookStep` returns what the flow config needs for that
 * button, so the host wires labels and the shell's stepper while the spend and
 * the enqueue stay here with the picker they belong to.
 *
 * Two rules shape this file:
 *
 * - D12 — a style change never renders. Picking a preset is one store write.
 *   Existing versions go stale through the render record; nothing is enqueued
 *   until the creator presses the button.
 * - D3 — the persisted stage is the only completion signal. `board.style` is
 *   already non-empty here, because step 2's Director run copies its
 *   `style_bible` into it, so the step's completion is written, never inferred.
 */

import React, { useCallback, useMemo, useState } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  FormField,
  GAP,
  SelectField,
  Text
} from "../../ui_primitives";
import ImageModelSelect from "../../properties/ImageModelSelect";
import { useDefaultStillModel } from "../../../hooks/storyboard/useDefaultStillModel";
import type { ImageModelValue } from "../../../stores/ApiTypes";
import type { ImageModelTask } from "../../../hooks/useModelsByProvider";
import { SETUP_FIELD_WIDTH } from "../layout";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { ASPECT_OPTIONS } from "../../storyboard/aspectOptions";
import { useInStudio } from "../../../studio/StudioContext";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../../serverState/useEntities";
import { useStylePresets } from "../../../serverState/useStylePresets";
import { useGenerateShot } from "../../../hooks/storyboard/useGenerateShot";
import { useRenderBatchCostEstimate } from "../../../hooks/storyboard/useRenderBatchCostEstimate";
import { STYLE_DESCRIPTIONS } from "../styleDescriptions";
import { AddStyleDialog } from "./AddStyleDialog";
import { useCustomStyle } from "./useCustomStyle";
import { setShotlistImport, useShotlistImportSummary } from "./setupChoices";

export interface LookStepProps {
  boardId: string;
}

/** What a keyframe model has to be able to do — the board's own rule. */
const STILL_MODEL_TASKS: ImageModelTask[] = ["text_to_image", "image_to_image"];

/** Stable empty results, so a selector never hands React a fresh array. */
const NO_SHOTS: readonly Shot[] = [];
const NO_IDS: readonly string[] = [];

/**
 * The stills the generate button would render: exactly the shots the board
 * toolbar's `Render stills` batch would take, so the estimate the creator sees
 * prices the click they are about to make.
 */
const useShotsToRender = (boardId: string): Shot[] => {
  const shots = useStoryboardStore(
    useCallback(
      (state) => state.getBoard(boardId)?.shots ?? NO_SHOTS,
      [boardId]
    )
  );
  return useMemo(
    () =>
      shots.filter(
        (shot) =>
          !shot.keyframe &&
          (shot.status === "planned" || shot.status === "failed")
      ),
    [shots]
  );
};

export interface LookStepControls {
  /** False until a style is on the board. */
  canAdvance: boolean;
  /** Why `canAdvance` is false, for the shell to show beside the button. */
  blockedReason: string | undefined;
  /** What the generate click spends, or undefined when nothing priced it. */
  primaryDetail: string | undefined;
  /** Write the terminal stage, then enqueue every still. */
  generate: () => Promise<void>;
}

/**
 * The generate action and its price. Separate from the body because the button
 * lives on the shell, and the host that builds the flow config should not have
 * to reassemble the batch path to fill it in.
 */
export function useLookStep(boardId: string): LookStepControls {
  const setSetup = useStoryboardStore((state) => state.setSetup);
  const style = useStoryboardStore(
    useCallback((state) => state.getBoard(boardId)?.style ?? "", [boardId])
  );
  const shots = useShotsToRender(boardId);
  const hasStillModel = useStoryboardStore(
    useCallback(
      (state) => Boolean(state.getBoard(boardId)?.imageModel?.id),
      [boardId]
    )
  );
  const { generateKeyframe } = useGenerateShot();
  const estimate = useRenderBatchCostEstimate(boardId, shots, "still");

  const generate = useCallback(async () => {
    // D3: the stage is written before the first job is enqueued, so a creator
    // who closes the tab mid-batch reopens on the board rather than back in
    // the flow with a half-rendered document behind it.
    setSetup(boardId, { stage: "done" });
    // A shot that cannot start records the reason on itself, so one refusal
    // must not stop the rest of the batch — the board's own batch button
    // loops the same way.
    await Promise.all(
      shots.map((shot) =>
        generateKeyframe(boardId, shot).catch(() => undefined)
      )
    );
  }, [boardId, generateKeyframe, setSetup, shots]);

  const primaryDetail =
    estimate.pricedCount > 0 && estimate.cost > 0
      ? `${estimate.shotCount} still${estimate.shotCount === 1 ? "" : "s"} · about ${formatUsd(estimate.cost)}`
      : undefined;

  // The one spending click on the whole flow. It does not fire until the
  // board names the model that will draw the stills: without one the request
  // falls back to a server default the creator never chose and cannot see,
  // and nothing can price it (`primaryDetail` stays empty).
  const blockedReason =
    style.trim().length === 0
      ? "Pick an art style"
      : hasStillModel
        ? undefined
        : "Pick a still model";

  return {
    canAdvance: blockedReason === undefined,
    blockedReason,
    primaryDetail,
    generate
  };
}

/**
 * The model that draws every still, with the saved default pre-filled. Its own
 * component so the catalog behind it is only fetched by the step that shows
 * it, and so the picker sits with the price it decides.
 */
const StillModelField: React.FC<{ boardId: string }> = ({ boardId }) => {
  useDefaultStillModel(boardId);
  // Studio's curated control prints the model's own blurb under the dropdown,
  // so the field's helper line would be a second line saying a similar thing —
  // and the quieter of the two is the one a reader gives up on.
  const inStudio = useInStudio();
  const imageModel = useStoryboardStore(
    useCallback(
      (state) => state.getBoard(boardId)?.imageModel ?? null,
      [boardId]
    )
  );
  const setImageModel = useStoryboardStore((state) => state.setImageModel);
  const handleChange = useCallback(
    (value: ImageModelValue) => setImageModel(boardId, value),
    [boardId, setImageModel]
  );
  return (
    <FormField
      label="Still model"
      helperText={
        inStudio
          ? undefined
          : "Draws every keyframe. The estimate beside the button follows it."
      }
      sx={{ maxWidth: SETUP_FIELD_WIDTH }}
    >
      <ImageModelSelect
        value={imageModel?.id ?? ""}
        task={STILL_MODEL_TASKS}
        onChange={handleChange}
      />
    </FormField>
  );
};

export const LookStep: React.FC<LookStepProps> = ({ boardId }) => {
  const [addingStyle, setAddingStyle] = useState(false);
  const customStyle = useCustomStyle(boardId);
  const style = useStoryboardStore(
    useCallback((state) => state.getBoard(boardId)?.style ?? "", [boardId])
  );
  const aspectRatio = useStoryboardStore(
    useCallback(
      (state) => state.getBoard(boardId)?.aspectRatio ?? "16:9",
      [boardId]
    )
  );
  const entityIds = useStoryboardStore(
    useCallback(
      (state) => state.getBoard(boardId)?.entityIds ?? NO_IDS,
      [boardId]
    )
  );
  // The descriptor call goes to the board's screenplay model, so the dialog
  // can name it and price it before it is made (F18).
  const directorModel = useStoryboardStore(
    useCallback(
      (state) => state.getBoard(boardId)?.directorModel ?? null,
      [boardId]
    )
  );
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setStylePreset = useStoryboardStore((state) => state.setStylePreset);

  const { data: presets } = useStylePresets();
  // The descriptors `setStylePreset` copies onto the board come from the
  // library, not from the tile: the same query the board and the agent bridge
  // read, so a preset means the same thing whichever surface applied it.
  const { data: entities } = useEntities();

  const presetTiles = useMemo<PresetTile[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.entityId,
        title: preset.name,
        description:
          STYLE_DESCRIPTIONS[preset.presetId] ?? preset.descriptor.trim(),
        image: preset.thumbnail
      })),
    [presets]
  );

  const selectedId = useMemo(() => {
    const styleIds = new Set(
      (entities ?? []).filter((e) => e.kind === "style").map((e) => e.id)
    );
    return [...entityIds].reverse().find((id) => styleIds.has(id)) ?? null;
  }, [entities, entityIds]);

  /** The style entity the board is on, whether or not it is a shipped one. */
  const selectedEntity = useMemo(
    () =>
      selectedId === null
        ? null
        : ((entities ?? []).find((entity) => entity.id === selectedId) ?? null),
    [entities, selectedId]
  );

  // A style the creator just made is a style entity like any other, but it is
  // not in the shipped twelve — without its own tile the grid would show
  // nothing selected right after it was applied (F19).
  const tiles = useMemo<PresetTile[]>(() => {
    if (
      selectedEntity === null ||
      presetTiles.some((tile) => tile.id === selectedEntity.id)
    ) {
      return presetTiles;
    }
    return [
      ...presetTiles,
      {
        id: selectedEntity.id,
        title: selectedEntity.name,
        description: selectedEntity.descriptor.trim(),
        image: selectedEntity.reference_images?.[0]
      }
    ];
  }, [presetTiles, selectedEntity]);

  const handleSelect = useCallback(
    (entityId: string) => {
      setStylePreset(boardId, entityId, entities ?? []);
    },
    [boardId, entities, setStylePreset]
  );

  const handleAspect = useCallback(
    (value: string) => setAspectRatio(boardId, value),
    [boardId, setAspectRatio]
  );

  // The look in one line: the style entity's own name and descriptor when the
  // board is on one, and the Director's style bible when it is not.
  const appliedStyle =
    selectedEntity !== null
      ? `Applied: ${selectedEntity.name}${
          selectedEntity.descriptor.trim().length > 0
            ? ` — ${selectedEntity.descriptor.trim()}`
            : ""
        }`
      : style.trim().length > 0
        ? `Your Director wrote the look: ${style.trim()}`
        : null;

  const shotlistImport = useShotlistImportSummary(boardId);
  const dismissImportSummary = useCallback(
    () => setShotlistImport(boardId, null),
    [boardId]
  );

  // `PresetTileGrid` is memoized, so both handlers keep a stable identity.
  const openAddStyle = useCallback(() => setAddingStyle(true), []);
  const clearStyleError = customStyle.clearError;
  const closeAddStyle = useCallback(() => {
    clearStyleError();
    setAddingStyle(false);
  }, [clearStyleError]);

  return (
    <FlexColumn gap={GAP.spacious}>
      {/* The step names itself before it asks anything, the way steps 1 and 2
          do (PRD § 7.3, F32). */}
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          Choose your aspect ratio and art style
        </Text>
        <Text size="normal" color="secondary">
          Set the look with a preset or your own references. You can change it
          later.
        </Text>
      </FlexColumn>
      {/* A shotlist import lands here rather than on the story steps, so what
          it wrote is said here — inline, and only expanded on request (F29). */}
      {shotlistImport ? (
        <AlertBanner severity="info" title="Shotlist imported">
          <FlexColumn gap={GAP.tight}>
            <Caption component="span">
              {`${shotlistImport.shotCount} shot${
                shotlistImport.shotCount === 1 ? "" : "s"
              } are on your board.`}
            </Caption>
            {shotlistImport.entries.length > 0 ? (
              <Box component="details">
                <Caption component="summary">
                  {`${shotlistImport.entries.length} value${
                    shotlistImport.entries.length === 1 ? "" : "s"
                  } did not come with them`}
                </Caption>
                <FlexColumn
                  gap={GAP.tight}
                  component="ul"
                  sx={{
                    listStyle: "none",
                    margin: 0,
                    padding: 0,
                    "& li": { listStyle: "none" }
                  }}
                >
                  {shotlistImport.entries.map((entry) => (
                    <Caption
                      key={`${entry.row}:${entry.column}:${entry.value}`}
                      component="li"
                      color="secondary"
                    >
                      Row {entry.row}, {entry.column}
                      {entry.value === "" ? "" : ` — “${entry.value}”`}:{" "}
                      {entry.reason}
                    </Caption>
                  ))}
                </FlexColumn>
              </Box>
            ) : null}
            <FlexRow>
              <EditorButton
                variant="text"
                size="small"
                onClick={dismissImportSummary}
              >
                Dismiss
              </EditorButton>
            </FlexRow>
          </FlexColumn>
        </AlertBanner>
      ) : null}
      <Box sx={{ maxWidth: SETUP_FIELD_WIDTH }}>
        <SelectField
          label="Aspect ratio"
          value={aspectRatio}
          onChange={handleAspect}
          options={ASPECT_OPTIONS}
        />
      </Box>
      <StillModelField boardId={boardId} />
      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Art style
        </Text>
        {/* What the board will actually draw in, always — a style the creator
            made themselves and a style bible the Director wrote are both real
            looks, and neither of them used to say anything here (F19). */}
        {appliedStyle ? (
          <Caption component="p" color="secondary">
            {appliedStyle}
          </Caption>
        ) : null}
        <PresetTileGrid
          label="Art style"
          presets={tiles}
          selectedId={selectedId}
          onSelect={handleSelect}
          onAddOwn={openAddStyle}
          addOwnLabel="Add your own style"
          addOwnDisabled={customStyle.saving}
        />
      </FlexColumn>
      <AddStyleDialog
        open={addingStyle}
        saving={customStyle.saving}
        error={customStyle.error}
        model={directorModel}
        onClose={closeAddStyle}
        onSubmit={customStyle.addStyle}
      />
    </FlexColumn>
  );
};

export default LookStep;
