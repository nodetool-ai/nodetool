/** @jsxImportSource @emotion/react */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import StopRoundedIcon from "@mui/icons-material/StopRounded";

import type { VideoModelValue } from "../../../stores/ApiTypes";
import type { TimelineClip } from "@nodetool-ai/timeline";
import {
  activeTakeIdOf,
  captureMediaEditSourceContext,
  getReplayRecipe,
  type MediaEditSourceContextResult
} from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { findClipById } from "../../../stores/timeline/clipLookup";
import { useDirectGenPendingStore } from "../../../hooks/timeline/directGenPending";
import { useVideoModelsByProvider } from "../../../hooks/useModelsByProvider";
import { useTimelineDirectGenJob } from "../../../hooks/timeline/useTimelineDirectGenJob";
import { isElectron, isLocalhost } from "../../../lib/env";
import { estimateGenerationCost } from "../../../utils/generationCostEstimate";
import { generationCostLine } from "../../costs/costLine";
import CostEstimateLine from "../../costs/CostEstimateLine";
import VideoModelSelect from "../../properties/VideoModelSelect";
import CuratedModelSelect from "../../properties/curated/CuratedModelSelect";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SPACING,
  TextInput
} from "../../ui_primitives";
import { InspectorSectionTitle, InspectorSliderRow } from "./InspectorPrimitives";

interface AIEditClipPanelProps {
  clipId: string;
}

const DEFAULT_STRENGTH = 0.65;
const IS_MANAGED_BUILD = !isLocalhost && !isElectron;

const toVideoModelValue = (model: {
  id: string;
  name: string;
  provider: string;
  supported_tasks?: string[];
}): VideoModelValue => ({
  type: "video_model",
  id: model.id,
  name: model.name,
  provider: model.provider,
  supported_tasks: model.supported_tasks
});

export function getMediaEditEligibility(
  sequenceId: string | null | undefined,
  clip: TimelineClip | undefined
): MediaEditSourceContextResult | { ok: false; error: string } {
  if (!sequenceId) {
    return { ok: false, error: "Select a timeline sequence before editing." };
  }
  if (!clip) {
    return { ok: false, error: "Select a clip before editing video." };
  }
  return captureMediaEditSourceContext(sequenceId, clip);
}

const AIEditClipPanel: React.FC<AIEditClipPanelProps> = ({ clipId }) => {
  const clip = useTimelineStore((state) => findClipById(state.clips, clipId));
  const sequenceId = useTimelineStore((state) => state.sequenceId);
  const { models, isLoading, error, refetch } = useVideoModelsByProvider({
    task: "video_to_video"
  });
  const availableModels = useMemo(
    () =>
      IS_MANAGED_BUILD
        ? models.filter((model) => model.provider === "nodetool")
        : models,
    [models]
  );
  const managedModelOptions = useMemo(
    () =>
      availableModels.map((model) => ({
        id: model.id,
        modelId: model.id,
        value: toVideoModelValue(model),
        label: model.name,
        blurb: "",
        tasks: model.supported_tasks ?? []
      })),
    [availableModels]
  );
  const { startEdit, startNewTake, cancel } = useTimelineDirectGenJob();
  const pendingEdit = useDirectGenPendingStore((state) => {
    if (!sequenceId) return undefined;
    return state.pending[sequenceId]?.find(
      (job) => job.clipId === clipId && job.mediaEdit !== undefined
    );
  });
  const pendingNewTake = useDirectGenPendingStore((state) => {
    if (!sequenceId) return undefined;
    return state.pending[sequenceId]?.find(
      (job) => job.clipId === clipId && job.candidateOnly === true
    );
  });
  const latestSettlement = useDirectGenPendingStore((state) => {
    if (!sequenceId) return undefined;
    return Object.values(state.editSettlements)
      .filter(
        (settlement) =>
          settlement.sequenceId === sequenceId &&
          settlement.clipId === clipId
      )
      .sort((a, b) => b.settledAt - a.settledAt)[0];
  });
  const editFailure = useDirectGenPendingStore((state) =>
    sequenceId ? state.editFailures[sequenceId]?.[clipId] : undefined
  );
  const [instruction, setInstruction] = useState("");
  const [selectedModel, setSelectedModel] = useState<VideoModelValue | null>(
    null
  );
  const [strength, setStrength] = useState(DEFAULT_STRENGTH);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submissionFailed, setSubmissionFailed] = useState(false);
  const [newTakeError, setNewTakeError] = useState<string | null>(null);
  const [newTakeInstruction, setNewTakeInstruction] = useState("");

  const eligibility = useMemo(
    () => getMediaEditEligibility(sequenceId, clip),
    [clip, sequenceId]
  );

  const catalogModel = useMemo(() => {
    if (!selectedModel) return undefined;
    return availableModels.find(
      (model) =>
        model.id === selectedModel.id && model.provider === selectedModel.provider
    );
  }, [availableModels, selectedModel]);

  const preferredModel = useMemo(() => {
    if (clip?.provider && clip.model) {
      const current = availableModels.find(
        (model) =>
          model.id === clip.model && model.provider === clip.provider
      );
      if (current) return current;
    }
    return availableModels[0];
  }, [availableModels, clip?.model, clip?.provider]);

  useEffect(() => {
    if (isLoading || error) return;
    if (!selectedModel || !catalogModel) {
      setSelectedModel(
        preferredModel ? toVideoModelValue(preferredModel) : null
      );
    }
  }, [catalogModel, error, isLoading, preferredModel, selectedModel]);

  useEffect(() => {
    setInstruction("");
    setSelectedModel(null);
    setErrorMessage(null);
    setSubmissionFailed(false);
    setNewTakeError(null);
    setNewTakeInstruction("");
    setStrength(DEFAULT_STRENGTH);
  }, [clipId]);

  useEffect(() => {
    if (clip?.strength !== undefined) {
      setStrength(clip.strength);
    }
  }, [clip?.strength]);

  useEffect(() => {
    if (pendingEdit || !latestSettlement) return;
    setInstruction(latestSettlement.mediaEdit.instruction);
    const capturedModel = availableModels.find(
      (model) =>
        model.id === latestSettlement.mediaEdit.model &&
        model.provider === latestSettlement.mediaEdit.provider
    );
    if (capturedModel) {
      setSelectedModel(toVideoModelValue(capturedModel));
    }
  }, [availableModels, latestSettlement, pendingEdit]);

  const handleModelChange = useCallback((value: VideoModelValue) => {
    setSelectedModel(value);
    setErrorMessage(null);
    setSubmissionFailed(false);
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!clip || !eligibility.ok || !selectedModel || !instruction.trim()) {
      return;
    }
    setErrorMessage(null);
    setSubmissionFailed(false);
    const requestId = await startEdit({
      clipId: clip.id,
      instruction,
      provider: selectedModel.provider,
      model: selectedModel.id,
      strength: undefined,
      resolution: catalogModel?.resolutions?.[0] ?? clip.resolution
    });
    if (!requestId) {
      setSubmissionFailed(true);
      setErrorMessage(
        "The edit could not be submitted. Check the connection and try again."
      );
    }
  }, [catalogModel, clip, eligibility.ok, instruction, selectedModel, startEdit]);

  const newTakeEligibility = useMemo(() => {
    if (!clip || clip.mediaType !== "video") {
      return { ok: false as const, reason: "New take requires a video clip." };
    }
    const activeId = activeTakeIdOf(clip);
    const activeTake = activeId
      ? (clip.versions ?? []).find((take) => take.id === activeId)
      : undefined;
    return activeTake
      ? getReplayRecipe(activeTake)
      : { ok: false as const, reason: "This clip has no accepted take." };
  }, [clip]);

  const handleNewTake = useCallback(async () => {
    if (!clip || !newTakeEligibility.ok) return;
    setNewTakeError(null);
    const requestId = await startNewTake({
      clipId: clip.id,
      instruction: newTakeInstruction.trim() || undefined
    });
    if (!requestId) {
      setNewTakeError(
        "The new take could not be submitted. This clip may not have a complete generation recipe."
      );
    }
  }, [clip, newTakeEligibility.ok, newTakeInstruction, startNewTake]);

  if (!clip) return null;

  const active = pendingEdit !== undefined;
  const newTakeActive = pendingNewTake !== undefined;
  const canNewTake = newTakeEligibility.ok;
  const settledStatus = latestSettlement?.status;
  const failed =
    !active &&
    (submissionFailed ||
      editFailure !== undefined ||
      (settledStatus !== undefined && settledStatus !== "completed"));
  const noCompatibleModel =
    !isLoading && !error && availableModels.length === 0;
  const modelOptionsReady = Boolean(selectedModel && catalogModel);
  const costEstimate = estimateGenerationCost({
    kind: "video",
    provider: selectedModel?.provider,
    model: selectedModel?.id,
    seconds: Math.max(1, Math.round(clip.durationMs / 1000)),
    resolution: catalogModel?.resolutions?.[0] ?? clip.resolution
  });
  // VideoModel has no metadata declaring strength support for video edits.
  // Hide the control until providers expose that capability explicitly.
  const strengthSupported = false;
  const unavailableReason = !eligibility.ok
    ? eligibility.error
    : error
      ? "The video edit model catalog could not be loaded. Retry to check compatible providers."
      : noCompatibleModel
        ? "No compatible video edit model is available. Add a provider or install a local model that supports video_to_video."
        : undefined;
  const settlementMessage = active
    ? undefined
    : settledStatus === "cancelled"
      ? "The edit was cancelled. The accepted media was left unchanged."
      : settledStatus === "expired"
        ? "The edit expired before it finished. The captured request is available to retry."
        : settledStatus === "orphaned"
          ? "The source clip was deleted before the edit finished. The result was kept for inspection and was not applied."
          : settledStatus === "failed"
            ? "The provider failed this edit. The accepted media was left unchanged."
            : undefined;

  return (
    <CollapsibleSection
      title={
        <InspectorSectionTitle
          title="AI Edit"
          icon={<AutoAwesomeOutlinedIcon />}
        />
      }
      defaultOpen
      unmountOnExit={false}
    >
      <FlexColumn gap={SPACING.sm} sx={{ p: SPACING.md }}>
        {!eligibility.ok ? (
          <EmptyState
            variant="empty"
            size="small"
            title="Edit video unavailable"
            description={unavailableReason}
          />
        ) : (
          <>
            <TextInput
              value={instruction}
              onChange={(event) => setInstruction(event.target.value)}
              placeholder="Describe the change to make…"
              multiline
              minRows={2}
              maxRows={6}
              compact
              fullWidth
              inputProps={{
                "aria-label": "Edit instruction",
                "data-testid": "ai-edit-instruction"
              }}
              disabled={active}
            />

            {isLoading ? (
              <LoadingSpinner size="small" />
            ) : error || noCompatibleModel ? (
              <EmptyState
                variant={error ? "error" : "empty"}
                size="small"
                title="No compatible model"
                description={unavailableReason}
                actionText={error ? "Retry model catalog" : undefined}
                onAction={
                  error
                    ? () => void refetch()
                    : undefined
                }
              />
            ) : IS_MANAGED_BUILD ? (
              <CuratedModelSelect
                label="Video edit model"
                options={managedModelOptions}
                value={selectedModel?.id ?? ""}
                onChange={handleModelChange}
              />
            ) : (
              <VideoModelSelect
                value={selectedModel?.id ?? ""}
                provider={selectedModel?.provider}
                task="video_to_video"
                onChange={handleModelChange}
              />
            )}

            {strengthSupported && (
              <InspectorSliderRow
                label="Strength"
                min={0}
                max={1}
                step={0.05}
                value={strength}
                display={strength.toFixed(2)}
                onChange={setStrength}
              />
            )}

            <FlexRow justify="flex-end" fullWidth>
              <CostEstimateLine
                estimate={generationCostLine(costEstimate)}
                title="Estimated cost of this video edit"
              />
            </FlexRow>

            <EditorButton
              fullWidth
              variant={active ? "outlined" : "contained"}
              color={active ? "warning" : "primary"}
              startIcon={
                active ? <StopRoundedIcon /> : <AutoAwesomeOutlinedIcon />
              }
              disabled={
                active
                  ? false
                  : !instruction.trim() || !modelOptionsReady
              }
              onClick={() => {
                if (active) {
                  cancel(clip.id);
                } else {
                  void handleSubmit();
                }
              }}
              data-testid="ai-edit-submit"
            >
              {active ? "Cancel" : failed ? "Retry" : "Edit video"}
            </EditorButton>

            {canNewTake && (
              <FlexColumn gap={SPACING.sm}>
                <TextInput
                  value={newTakeInstruction}
                  onChange={(event) => setNewTakeInstruction(event.target.value)}
                  placeholder="Optional new-take direction…"
                  multiline
                  minRows={2}
                  maxRows={4}
                  compact
                  fullWidth
                  inputProps={{ "aria-label": "New take direction" }}
                  disabled={active || newTakeActive}
                />
                <EditorButton
                  fullWidth
                  variant="outlined"
                  disabled={active || newTakeActive}
                  onClick={() => void handleNewTake()}
                  data-testid="new-take-submit"
                >
                  {newTakeActive ? "Generating new take…" : "New take"}
                </EditorButton>
              </FlexColumn>
            )}

            {settlementMessage && (
              <Caption color="error" sx={{ textAlign: "center" }}>
                {settlementMessage}
              </Caption>
            )}
            {failed && (
              <Caption color="error" sx={{ textAlign: "center" }}>
                {editFailure ??
                  "The edit failed. Update the instruction or model and retry."}
              </Caption>
            )}
            {active && (
              <LoadingSpinner
                variant="dots"
                size="small"
                text="Editing video…"
              />
            )}
            {errorMessage && (
              <Caption color="error" sx={{ textAlign: "center" }}>
                {errorMessage}
              </Caption>
            )}
            {newTakeError && (
              <Caption color="error" sx={{ textAlign: "center" }}>
                {newTakeError}
              </Caption>
            )}
          </>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

AIEditClipPanel.displayName = "AIEditClipPanel";

export default memo(AIEditClipPanel);
