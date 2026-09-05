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

import React, { useCallback, useMemo } from "react";
import type { Shot } from "@nodetool-ai/protocol";
import { formatUsd } from "@nodetool-ai/model-pricing";

import {
  FlexColumn,
  GAP,
  SelectField,
  Text
} from "../../ui_primitives";
import { PresetTileGrid, type PresetTile } from "../PresetTileGrid";
import { ASPECT_OPTIONS } from "../../storyboard/aspectOptions";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useEntities } from "../../../serverState/useEntities";
import { useStylePresets } from "../../../serverState/useStylePresets";
import { useGenerateShot } from "../../../hooks/storyboard/useGenerateShot";
import { useRenderBatchCostEstimate } from "../../../hooks/storyboard/useRenderBatchCostEstimate";

export interface LookStepProps {
  boardId: string;
  /** Opens the "Add your own style" reference picker. */
  onAddOwnStyle: () => void;
  /** Off while the reference-to-descriptor call is in flight. */
  addOwnDisabled?: boolean;
  addOwnDisabledReason?: string;
}

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
      shots.map((shot) => generateKeyframe(boardId, shot).catch(() => undefined))
    );
  }, [boardId, generateKeyframe, setSetup, shots]);

  const primaryDetail =
    estimate.pricedCount > 0 && estimate.cost > 0
      ? `${estimate.shotCount} still${estimate.shotCount === 1 ? "" : "s"} · about ${formatUsd(estimate.cost)}`
      : undefined;

  return { canAdvance: style.trim().length > 0, primaryDetail, generate };
}

export const LookStep: React.FC<LookStepProps> = ({
  boardId,
  onAddOwnStyle,
  addOwnDisabled,
  addOwnDisabledReason
}) => {
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
  const setAspectRatio = useStoryboardStore((state) => state.setAspectRatio);
  const setStylePreset = useStoryboardStore((state) => state.setStylePreset);

  const { data: presets } = useStylePresets();
  // The descriptors `setStylePreset` copies onto the board come from the
  // library, not from the tile: the same query the board and the agent bridge
  // read, so a preset means the same thing whichever surface applied it.
  const { data: entities } = useEntities();

  const tiles = useMemo<PresetTile[]>(
    () =>
      (presets ?? []).map((preset) => ({
        id: preset.entityId,
        title: preset.name,
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

  return (
    <FlexColumn gap={GAP.spacious}>
      <SelectField
        label="Aspect ratio"
        value={aspectRatio}
        onChange={handleAspect}
        options={ASPECT_OPTIONS}
      />
      <FlexColumn gap={GAP.normal}>
        <Text size="small" component="h3">
          Art style
        </Text>
        <PresetTileGrid
          label="Art style"
          presets={tiles}
          selectedId={selectedId}
          onSelect={handleSelect}
          onAddOwn={onAddOwnStyle}
          addOwnLabel="Add your own style"
          addOwnDisabled={addOwnDisabled}
          addOwnDisabledReason={addOwnDisabledReason}
        />
      </FlexColumn>
    </FlexColumn>
  );
};

export default LookStep;
