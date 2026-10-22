/** @jsxImportSource @emotion/react */

import React, { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import CuratedModelSelect from "../../properties/curated/CuratedModelSelect";
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  Divider,
  EmptyState,
  FlexColumn,
  FlexRow,
  LoadingSpinner,
  SelectField,
  SPACING,
  TextArea,
  ThinkingIndicator,
  ToggleGroup,
  ToggleOption,
  AlertBanner
} from "../../ui_primitives";
import {
  INSPECTOR_FORM_SX,
  InspectorSectionTitle,
  InspectorSliderRow
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

interface AIEditClipPanelProps {
  clipId: string;
}

const DEFAULT_STRENGTH = 0.65;

/** Where a finished edit goes: a take to review, or straight onto the clip. */
type EditLanding = "take" | "replace";

const IS_MANAGED_BUILD = !isLocalhost && !isElectron;

const modelKey = (model: { id: string; provider: string }): string =>
  `${model.provider}:${model.id}`;

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
  const { t } = useTranslation();
  const clip = useTimelineStore((state) => findClipById(state.clips, clipId));
  const sequenceId = useTimelineStore((state) => state.sequenceId);
  const [open, setOpen] = usePersistedFold("ai-edit", true);
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
          settlement.sequenceId === sequenceId && settlement.clipId === clipId
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
  const [landing, setLanding] = useState<EditLanding>("take");
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
        model.id === selectedModel.id &&
        model.provider === selectedModel.provider
    );
  }, [availableModels, selectedModel]);

  const preferredModel = useMemo(() => {
    if (clip?.provider && clip.model) {
      const current = availableModels.find(
        (model) => model.id === clip.model && model.provider === clip.provider
      );
      if (current) return current;
    }
    return availableModels[0];
  }, [availableModels, clip?.model, clip?.provider]);

  // Runs before the model default below, so the reset on a new clip (and on
  // mount) cannot clear the default it just chose.
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
    if (isLoading || error) return;
    if (!selectedModel || !catalogModel) {
      setSelectedModel(
        preferredModel ? toVideoModelValue(preferredModel) : null
      );
    }
  }, [catalogModel, error, isLoading, preferredModel, selectedModel]);

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

  const modelOptions = useMemo(
    () =>
      availableModels.map((model) => ({
        value: modelKey(model),
        label: model.name
      })),
    [availableModels]
  );

  const handleModelKeyChange = useCallback(
    (key: string) => {
      const model = availableModels.find((item) => modelKey(item) === key);
      if (model) {
        handleModelChange(toVideoModelValue(model));
      }
    },
    [availableModels, handleModelChange]
  );

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
      resolution: catalogModel?.resolutions?.[0] ?? clip.resolution,
      replaceOnLand: landing === "replace"
    });
    if (!requestId) {
      setSubmissionFailed(true);
      setErrorMessage(t("pass3_22.timeline.inspector.aiEdit.submitFailed"));
    }
  }, [
    catalogModel,
    clip,
    eligibility.ok,
    instruction,
    landing,
    selectedModel,
    startEdit,
    t
  ]);

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
        t("pass3_22.timeline.inspector.aiEdit.newTakeSubmitFailed")
      );
    }
  }, [clip, newTakeEligibility.ok, newTakeInstruction, startNewTake, t]);

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
  const eligibilityErrorKey: Record<string, string> = {
    "Select a timeline sequence before editing.": "sequenceRequired",
    "Select a clip before editing video.": "clipRequired",
    "Edit video requires a video clip.": "videoClipRequired",
    "Edit video requires an active video asset.": "activeVideoAssetRequired",
    "Edit video requires a positive playable duration.":
      "positiveDurationRequired",
    "Edit video does not support time-remapped clips. Bake the retime first.":
      "timeRemapUnsupported",
    "Edit video supports constant positive playback speed only.":
      "constantSpeedRequired",
    "Edit video currently supports 1x playback only. Bake the speed change first.":
      "playbackSpeedUnsupported",
    "Edit video could not resolve a positive constant source window.":
      "sourceWindowInvalid",
    "Edit video source bounds do not match the clip's constant playback speed.":
      "sourceBoundsMismatch"
  };
  const unavailableReason = !eligibility.ok
    ? t(
        `pass3_22.timeline.inspector.aiEdit.eligibility.${eligibilityErrorKey[eligibility.error] ?? "unavailable"}`
      )
    : error
      ? t("pass3_22.timeline.inspector.aiEdit.modelCatalogFailed")
      : noCompatibleModel
        ? t("pass3_22.timeline.inspector.aiEdit.noCompatibleModelDescription")
        : undefined;
  const settlementMessage = active
    ? undefined
    : settledStatus === "cancelled"
      ? t("pass3_22.timeline.inspector.aiEdit.settlement.cancelled")
      : settledStatus === "expired"
        ? t("pass3_22.timeline.inspector.aiEdit.settlement.expired")
        : settledStatus === "orphaned"
          ? t("pass3_22.timeline.inspector.aiEdit.settlement.orphaned")
          : settledStatus === "failed"
            ? t("pass3_22.timeline.inspector.aiEdit.settlement.failed")
            : undefined;

  return (
    <CollapsibleSection
      title={
        <InspectorSectionTitle
          title={t("pass3_22.timeline.inspector.aiEdit.title")}
          icon={<AutoAwesomeOutlinedIcon />}
        />
      }
      open={open}
      onToggle={setOpen}
      unmountOnExit={false}
    >
      <FlexColumn sx={INSPECTOR_FORM_SX}>
        {!eligibility.ok ? (
          <EmptyState
            variant="empty"
            size="small"
            title={t("pass3_22.timeline.inspector.aiEdit.unavailableTitle")}
            description={unavailableReason}
          />
        ) : (
          <>
            <TextArea
              label={t("pass3_22.timeline.inspector.aiEdit.instruction")}
              value={instruction}
              onChange={(value) => setInstruction(value)}
              placeholder={t(
                "pass3_22.timeline.inspector.aiEdit.instructionPlaceholder"
              )}
              minRows={3}
              maxRows={8}
              compact
              fullWidth
              inputProps={{
                "aria-label": t(
                  "pass3_22.timeline.inspector.aiEdit.instructionAriaLabel"
                ),
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
                title={t(
                  "pass3_22.timeline.inspector.aiEdit.noCompatibleModelTitle"
                )}
                description={unavailableReason}
                actionText={
                  error
                    ? t("pass3_22.timeline.inspector.aiEdit.retryModelCatalog")
                    : undefined
                }
                onAction={error ? () => void refetch() : undefined}
              />
            ) : IS_MANAGED_BUILD ? (
              <CuratedModelSelect
                label={t("pass3_22.timeline.inspector.aiEdit.videoEditModel")}
                options={managedModelOptions}
                value={selectedModel?.id ?? ""}
                onChange={handleModelChange}
              />
            ) : (
              <SelectField
                label={t("pass3_22.timeline.inspector.aiEdit.model")}
                size="small"
                value={selectedModel ? modelKey(selectedModel) : ""}
                options={modelOptions}
                onChange={handleModelKeyChange}
                disabled={active}
              />
            )}

            <FlexColumn gap={SPACING.xs}>
              <ToggleGroup
                exclusive
                size="small"
                fullWidth
                value={landing}
                onChange={(_, value: EditLanding | null) => {
                  if (value) setLanding(value);
                }}
                disabled={active}
                aria-label={t(
                  "pass3_22.timeline.inspector.aiEdit.resultDestination"
                )}
              >
                <ToggleOption value="take" data-testid="ai-edit-landing-take">
                  {t("pass3_22.timeline.inspector.aiEdit.addAsTake")}
                </ToggleOption>
                <ToggleOption
                  value="replace"
                  data-testid="ai-edit-landing-replace"
                >
                  {t("pass3_22.timeline.inspector.aiEdit.replaceClip")}
                </ToggleOption>
              </ToggleGroup>
              <Caption>
                {t(`pass3_22.timeline.inspector.aiEdit.landingHint.${landing}`)}
              </Caption>
            </FlexColumn>

            {strengthSupported && (
              <InspectorSliderRow
                label={t("pass3_22.timeline.inspector.aiEdit.strength")}
                min={0}
                max={1}
                step={0.05}
                value={strength}
                display={strength.toFixed(2)}
                onChange={setStrength}
              />
            )}

            <FlexColumn gap={SPACING.xs}>
              <EditorButton
                fullWidth
                variant={active ? "outlined" : "contained"}
                color={active ? "warning" : "primary"}
                startIcon={
                  active ? <StopRoundedIcon /> : <AutoAwesomeOutlinedIcon />
                }
                disabled={
                  active ? false : !instruction.trim() || !modelOptionsReady
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
                {active
                  ? t("pass3_22.timeline.inspector.aiEdit.cancel")
                  : failed
                    ? t("pass3_22.timeline.inspector.aiEdit.retry")
                    : t("pass3_22.timeline.inspector.aiEdit.editVideo")}
              </EditorButton>
              <FlexRow justify="flex-end" fullWidth>
                <CostEstimateLine
                  estimate={generationCostLine(costEstimate)}
                  title={t("pass3_22.timeline.inspector.aiEdit.estimatedCost")}
                />
              </FlexRow>
            </FlexColumn>

            {active && (
              <ThinkingIndicator
                label={t("pass3_22.timeline.inspector.aiEdit.editingVideo")}
                announce
              />
            )}
            {settlementMessage && (
              <AlertBanner severity="warning" compact>{settlementMessage}</AlertBanner>
            )}
            {failed && (
              <ErrorBanner
                report={{
                  source: "job-failure",
                  summary: t(
                    "pass3_22.timeline.inspector.aiEdit.editFailedSummary"
                  ),
                  errorText: editFailure ?? undefined
                }}
              >
                {editFailure ??
                  t("pass3_22.timeline.inspector.aiEdit.editFailed")}
              </ErrorBanner>
            )}
            {errorMessage && (
              <ErrorBanner
                report={{
                  source: "operation-failure",
                  summary: t(
                    "pass3_22.timeline.inspector.aiEdit.editCouldNotStartSummary"
                  ),
                  errorText: errorMessage
                }}
              >
                {errorMessage}
              </ErrorBanner>
            )}

            {canNewTake && (
              <>
                <Divider />
                <TextArea
                  label={t("pass3_22.timeline.inspector.aiEdit.newTake")}
                  value={newTakeInstruction}
                  onChange={(value) => setNewTakeInstruction(value)}
                  placeholder={t(
                    "pass3_22.timeline.inspector.aiEdit.newTakePlaceholder"
                  )}
                  minRows={2}
                  maxRows={4}
                  compact
                  fullWidth
                  inputProps={{
                    "aria-label": t(
                      "pass3_22.timeline.inspector.aiEdit.newTakeAriaLabel"
                    )
                  }}
                  disabled={active || newTakeActive}
                />
                <EditorButton
                  fullWidth
                  variant="outlined"
                  disabled={active || newTakeActive}
                  onClick={() => void handleNewTake()}
                  data-testid="new-take-submit"
                >
                  {newTakeActive
                    ? t("pass3_22.timeline.inspector.aiEdit.generatingNewTake")
                    : t("pass3_22.timeline.inspector.aiEdit.newTake")}
                </EditorButton>
                {newTakeError && (
                  <ErrorBanner
                    report={{
                      source: "operation-failure",
                      summary: t(
                        "pass3_22.timeline.inspector.aiEdit.newTakeCouldNotStartSummary"
                      ),
                      errorText: newTakeError
                    }}
                  >
                    {newTakeError}
                  </ErrorBanner>
                )}
              </>
            )}
          </>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

AIEditClipPanel.displayName = "AIEditClipPanel";

export default memo(AIEditClipPanel);
