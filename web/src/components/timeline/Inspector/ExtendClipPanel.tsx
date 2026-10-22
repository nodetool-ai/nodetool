import React, { memo, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import ErrorBanner from "../../support/ErrorBanner";
import {
  Caption,
  CollapsibleSection,
  Divider,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SelectField,
  SPACING,
  TextArea,
  TextInput,
  ThinkingIndicator,
  VideoPlayer
} from "../../ui_primitives";
import {
  INSPECTOR_FORM_SX,
  InspectorSectionTitle
} from "./InspectorPrimitives";
import { usePersistedFold } from "./usePersistedFold";

const TIMING_OPTIONS: ReadonlyArray<{
  value: ExtensionTiming;
  labelKey: string;
}> = [
  { value: "keep-cut", labelKey: "keepCut" },
  { value: "available-space", labelKey: "availableSpace" },
  { value: "ripple", labelKey: "ripple" }
];

const ExtendClipPanel: React.FC<{ clipId: string }> = ({ clipId }) => {
  const { t, i18n } = useTranslation();
  const formatSeconds = useMemo(
    () => {
      const formatter = new Intl.NumberFormat(i18n.language, {
        maximumFractionDigits: 2
      });
      return (seconds: number): string => formatter.format(seconds);
    },
    [i18n.language]
  );
  const [open, setOpen] = usePersistedFold("extend", true);
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
      ? [
          {
            value: "start" as const,
            label: t("i18n-cont-inspector-02.extendClip.start")
          }
        ]
      : []),
    ...(!hasDirectionTasks ||
    model?.supported_tasks?.includes("extend_video_end")
      ? [
          {
            value: "end" as const,
            label: t("i18n-cont-inspector-02.extendClip.end")
          }
        ]
      : [])
  ];
  const selectedDirection = directionOptions.some(
    (option) => option.value === direction
  )
    ? direction
    : (directionOptions[0]?.value ?? "end");
  // A model that lists durations accepts nothing else, so offer only those.
  const durationChoices = model?.durations?.length ? model.durations : null;
  const selectedDuration =
    durationChoices && !durationChoices.includes(Number(duration))
      ? String(durationChoices[0])
      : duration;
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
        addedSourceDurationMs: Number(selectedDuration) * 1000,
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
        <InspectorSectionTitle
          title={t("i18n-cont-inspector-02.extendClip.title")}
          icon={<MoreTimeOutlinedIcon />}
        />
      }
      open={open}
      onToggle={setOpen}
    >
      <FlexColumn sx={INSPECTOR_FORM_SX}>
        {!eligibility?.ok ? (
          <Caption color="secondary">
            {eligibility &&
              t(
                `i18n-cont-inspector-02.extendClip.eligibility.${eligibility.code}`
              )}
          </Caption>
        ) : (
          <>
            {isLoading ? (
              <LoadingSpinner size="small" />
            ) : !model ? (
              <EmptyState
                variant="empty"
                size="small"
                title={t("i18n-cont-inspector-02.extendClip.noModelTitle")}
                description={
                  modelError
                    ? t(
                        "i18n-cont-inspector-02.extendClip.modelsLoadFailed"
                      )
                    : t(
                        "i18n-cont-inspector-02.extendClip.connectProvider"
                      )
                }
              />
            ) : (
              <>
                <SelectField
                  label={t("i18n-cont-inspector-02.extendClip.modelLabel")}
                  size="small"
                  value={`${model.provider}:${model.id}`}
                  options={modelsForTask.map((item) => ({
                    value: `${item.provider}:${item.id}`,
                    label: item.name
                  }))}
                  onChange={setModelKey}
                  disabled={pending}
                />
                <FlexRow gap={SPACING.sm} align="flex-end" fullWidth>
                  <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
                    <SelectField
                      label={t(
                        "i18n-cont-inspector-02.extendClip.directionLabel"
                      )}
                      size="small"
                      value={selectedDirection}
                      options={directionOptions}
                      onChange={(value) =>
                        setDirection(value === "start" ? "start" : "end")
                      }
                      disabled={pending}
                    />
                  </FlexColumn>
                  <FlexColumn sx={{ flex: 1, minWidth: 0 }}>
                    {durationChoices ? (
                      <SelectField
                        label={t(
                          "i18n-cont-inspector-02.extendClip.secondsToAddLabel"
                        )}
                        size="small"
                        value={selectedDuration}
                        options={durationChoices.map((seconds) => ({
                          value: String(seconds),
                          label: t(
                            "i18n-cont-inspector-02.extendClip.durationOption",
                            { seconds: formatSeconds(seconds), count: seconds }
                          )
                        }))}
                        onChange={setDuration}
                        disabled={pending}
                      />
                    ) : (
                      <TextInput
                        label={t(
                          "i18n-cont-inspector-02.extendClip.secondsToAddLabel"
                        )}
                        type="number"
                        value={duration}
                        onChange={(event) => setDuration(event.target.value)}
                        disabled={pending}
                        inputProps={{ min: 0, step: 1 }}
                        compact
                        fullWidth
                      />
                    )}
                  </FlexColumn>
                </FlexRow>
                <TextArea
                  label={t(
                    "i18n-cont-inspector-02.extendClip.intentLabel"
                  )}
                  value={intent}
                  onChange={(value) => setIntent(value)}
                  placeholder={t(
                    "i18n-cont-inspector-02.extendClip.intentPlaceholder"
                  )}
                  disabled={pending}
                  minRows={3}
                  maxRows={8}
                  compact
                  fullWidth
                />
                <EditorButton
                  fullWidth
                  variant="contained"
                  startIcon={<MoreTimeOutlinedIcon />}
                  onClick={submit}
                  disabled={!intent.trim() || !sequenceId || !(Number(selectedDuration) > 0)}
                  loading={pending}
                >
                  {pending
                    ? t("i18n-cont-inspector-02.extendClip.extending")
                    : t("i18n-cont-inspector-02.extendClip.generate")}
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
              <Divider />
              {take ? (
                <>
                  <FlexRow justify="space-between" align="center" fullWidth>
                    <Label>
                      {t(
                        job.request.direction === "start"
                          ? "i18n-cont-inspector-02.extendClip.startExtension"
                          : "i18n-cont-inspector-02.extendClip.endExtension",
                        {
                          seconds: formatSeconds(
                            job.request.addedSourceDurationMs / 1000
                          ),
                          count: job.request.addedSourceDurationMs / 1000
                        }
                      )}
                    </Label>
                    <Caption color={accepted ? "primary" : "secondary"}>
                      {accepted
                        ? t("i18n-cont-inspector-02.extendClip.inUse")
                        : t("i18n-cont-inspector-02.extendClip.candidate")}
                    </Caption>
                  </FlexRow>
                  <EditorButton
                    fullWidth
                    variant="outlined"
                    onClick={() =>
                      setPreview(preview === take.assetId ? null : take.assetId)
                    }
                  >
                    {preview === take.assetId
                      ? t("i18n-cont-inspector-02.extendClip.closePreview")
                      : t("i18n-cont-inspector-02.extendClip.preview")}
                  </EditorButton>
                  {preview === take.assetId && (
                    <VideoPlayer
                      locator={`asset://${take.assetId}`}
                      label={t(
                        "i18n-cont-inspector-02.extendClip.candidateLabel"
                      )}
                    />
                  )}
                  <Caption color="secondary">
                    {t("i18n-cont-inspector-02.extendClip.applyToCut")}
                  </Caption>
                  {TIMING_OPTIONS.map((option) => (
                    <EditorButton
                      key={option.value}
                      fullWidth
                      variant="outlined"
                      disabled={accepted}
                      onClick={() =>
                        handleApplyCandidate(job.request, option.value)
                      }
                    >
                      {t(
                        `i18n-cont-inspector-02.extendClip.timing.${option.labelKey}`
                      )}
                    </EditorButton>
                  ))}
                </>
              ) : job.status !== "running" ? (
                <>
                  {job.error && (
                    <ErrorBanner
                      report={{
                        source: "job-failure",
                        summary: t(
                          "i18n-cont-inspector-02.extendClip.jobFailed"
                        ),
                        errorText: job.error
                      }}
                    >
                      {job.error}
                    </ErrorBanner>
                  )}
                  <EditorButton
                    fullWidth
                    variant="outlined"
                    onClick={() => recover(job.request)}
                  >
                    {t("i18n-cont-inspector-02.extendClip.recover")}
                  </EditorButton>
                </>
              ) : (
                <ThinkingIndicator
                  label={t("i18n-cont-inspector-02.extendClip.generating")}
                  announce
                />
              )}
            </FlexColumn>
          );
        })}
        {error && (
          <ErrorBanner
            report={{
              source: "operation-failure",
              summary: t("i18n-cont-inspector-02.extendClip.startFailed"),
              errorText: error
            }}
          >
            {error}
          </ErrorBanner>
        )}
      </FlexColumn>
    </CollapsibleSection>
  );
};

export default memo(ExtendClipPanel);
