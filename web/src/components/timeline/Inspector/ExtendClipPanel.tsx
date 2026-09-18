import React, { memo, useMemo, useState } from "react";
import MoreTimeOutlinedIcon from "@mui/icons-material/MoreTimeOutlined";
import { captureExtensionSource } from "@nodetool-ai/timeline";
import type { ExtensionRequest, ExtensionTiming } from "@nodetool-ai/timeline";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useVideoModelsByProvider } from "../../../hooks/useModelsByProvider";
import {
  useExtensionJobsStore,
  useTimelineExtension
} from "../../../hooks/timeline/useTimelineExtension";
import { isElectron, isLocalhost } from "../../../lib/env";
import {
  Caption,
  CollapsibleSection,
  EditorButton,
  EmptyState,
  FlexColumn,
  LoadingSpinner,
  SelectField,
  SPACING,
  TextInput,
  VideoPlayer
} from "../../ui_primitives";
import { InspectorSectionTitle } from "./InspectorPrimitives";

const TIMING_OPTIONS: ReadonlyArray<{ value: ExtensionTiming; label: string }> =
  [
    { value: "keep-cut", label: "Keep cut and retain handles" },
    { value: "available-space", label: "Extend into available space" },
    { value: "ripple", label: "Extend and ripple later clips" }
  ];

const ExtendClipPanel: React.FC<{ clipId: string }> = ({ clipId }) => {
  const clip = useTimelineStore((state) =>
    state.clips.find((item) => item.id === clipId)
  );
  const sequenceId = useTimelineStore((state) => state.sequenceId);
  const {
    models,
    isLoading,
    error: modelError
  } = useVideoModelsByProvider({ task: "extend_video" });
  const modelsForTask = useMemo(
    () =>
      models.filter(
        (model) =>
          model.supported_tasks?.includes("extend_video") &&
          (isLocalhost || isElectron || model.provider === "nodetool")
      ),
    [models]
  );
  const [modelKey, setModelKey] = useState("");
  const [direction, setDirection] = useState<"start" | "end">("end");
  const [duration, setDuration] = useState("3");
  const [intent, setIntent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const allJobs = useExtensionJobsStore((state) => state.jobs);
  const jobs = useMemo(
    () =>
      Object.values(allJobs).filter(
        (job) =>
          job.request.sequenceId === sequenceId &&
          job.request.source.clipId === clipId
      ),
    [allJobs, clipId, sequenceId]
  );
  const { start, recover, apply } = useTimelineExtension(sequenceId);
  const model =
    modelsForTask.find((item) => `${item.provider}:${item.id}` === modelKey) ??
    modelsForTask[0];
  const hasDirectionTasks = model?.supported_tasks?.some(
    (task) => task === "extend_video_start" || task === "extend_video_end"
  );
  const directionOptions = [
    ...(!hasDirectionTasks ||
    model?.supported_tasks?.includes("extend_video_start")
      ? [{ value: "start" as const, label: "Start" }]
      : []),
    ...(!hasDirectionTasks || model?.supported_tasks?.includes("extend_video_end")
      ? [{ value: "end" as const, label: "End" }]
      : [])
  ];
  const selectedDirection = directionOptions.some(
    (option) => option.value === direction
  )
    ? direction
    : directionOptions[0]?.value ?? "end";
  const pending = jobs.some((job) => job.status === "running");
  const eligibility = clip ? captureExtensionSource(clip) : null;

  if (!clip || clip.mediaType !== "video") {
    return null;
  }
  const submit = async (): Promise<void> => {
    if (!model) {
      return;
    }
    setError(null);
    try {
      await start({
        clipId,
        direction: selectedDirection,
        addedSourceDurationMs: Number(duration) * 1000,
        prompt: intent,
        model: {
          id: model.id,
          provider: model.provider,
          supportedTasks: model.supported_tasks,
          durations: model.durations ?? undefined
        }
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };
  const handleApplyCandidate = (
    request: ExtensionRequest,
    timing: ExtensionTiming
  ): void => {
    setError(null);
    try {
      apply(request, timing);
      setPreview(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure));
    }
  };

  return (
    <CollapsibleSection
      title={
        <InspectorSectionTitle title="Extend" icon={<MoreTimeOutlinedIcon />} />
      }
      defaultOpen
    >
      <FlexColumn gap={SPACING.md} sx={{ p: SPACING.md }}>
        {!eligibility?.ok ? (
          <Caption color="secondary">{eligibility?.error}</Caption>
        ) : (
          <>
            {isLoading ? (
              <LoadingSpinner size="small" />
            ) : !model ? (
              <EmptyState
                variant="empty"
                size="small"
                title="No extension model available"
                description={
                  modelError
                    ? "Could not load extension models. Try again when connected."
                    : "Connect a provider with a video extension model to use Extend."
                }
              />
            ) : (
              <>
                <SelectField
                  label="Extension model"
                  value={`${model.provider}:${model.id}`}
                  options={modelsForTask.map((item) => ({
                    value: `${item.provider}:${item.id}`,
                    label: item.name
                  }))}
                  onChange={setModelKey}
                  disabled={pending}
                />
                <SelectField
                  label="Extend from"
                  value={selectedDirection}
                  options={directionOptions}
                  onChange={(value) =>
                    setDirection(value === "start" ? "start" : "end")
                  }
                  disabled={pending}
                />
                <TextInput
                  label="Added source seconds"
                  type="number"
                  value={duration}
                  onChange={(event) => setDuration(event.target.value)}
                  disabled={pending}
                  inputProps={{ min: 0, step: 1 }}
                  compact
                  fullWidth
                />
                <TextInput
                  label="Extension intent"
                  value={intent}
                  onChange={(event) => setIntent(event.target.value)}
                  disabled={pending}
                  multiline
                  minRows={2}
                  compact
                  fullWidth
                />
                <EditorButton
                  onClick={submit}
                  disabled={
                    pending ||
                    !intent.trim() ||
                    !sequenceId ||
                    !(Number(duration) > 0)
                  }
                >
                  {pending ? "Extending…" : "Generate extension"}
                </EditorButton>
              </>
            )}
          </>
        )}
        {jobs.map((job) => {
          const take = clip.versions?.find(
            (item) => item.id === job.request.requestId
          );
          const accepted = take?.id === clip.activeTakeId;
          return (
            <FlexColumn key={job.request.requestId} gap={SPACING.sm}>
              {take ? (
                <>
                  <Caption>
                    {job.request.direction === "start" ? "Start" : "End"}{" "}
                    extension, {job.request.addedSourceDurationMs / 1000}s
                    {accepted ? " · In use" : " · Candidate"}
                  </Caption>
                  <EditorButton
                    onClick={() =>
                      setPreview(preview === take.assetId ? null : take.assetId)
                    }
                  >
                    {preview === take.assetId
                      ? "Close preview"
                      : "Preview extension"}
                  </EditorButton>
                  {preview === take.assetId && (
                    <VideoPlayer
                      locator={`asset://${take.assetId}`}
                      label="Extension candidate"
                    />
                  )}
                  {TIMING_OPTIONS.map((option) => (
                    <EditorButton
                      key={option.value}
                      disabled={accepted}
                      onClick={() =>
                        handleApplyCandidate(job.request, option.value)
                      }
                    >
                      {option.label}
                    </EditorButton>
                  ))}
                </>
              ) : job.status !== "running" ? (
                <>
                  {job.error && <Caption color="error">{job.error}</Caption>}
                  <EditorButton onClick={() => recover(job.request)}>
                    Recover extension
                  </EditorButton>
                </>
              ) : (
                <Caption color="secondary">
                  Extension generation is running.
                </Caption>
              )}
            </FlexColumn>
          );
        })}
        {error && <Caption color="error">{error}</Caption>}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export default memo(ExtendClipPanel);
