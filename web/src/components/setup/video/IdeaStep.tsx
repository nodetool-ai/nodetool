/**
 * Step 1 of the video flow — the idea (PRD § 8.1).
 *
 * One sentence, written straight onto the sequence's `setup.brief` as it is
 * typed, so `Continue` has only the stage left to write and a reload resumes
 * with the text intact (D1, D3).
 *
 * The three alternatives are the ways in that skip the writing: bring footage
 * you already have, start from a script, or open an empty timeline. Dropping
 * media places clips before any beat exists (criterion 1) — the plan then
 * describes the footage rather than inventing shots over it.
 *
 * The card is named "Drop your media", so the step is a drop target as well as
 * a picker: files dropped anywhere on it are imported in drop order. What
 * landed and what could not be placed is listed afterwards, and footage
 * dropped with no brief keeps the creator here, because step 2 ends in a
 * planner that refuses an empty one.
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  Chip,
  FlexColumn,
  FlexRow,
  GAP,
  getSpacingPx,
  ResponsiveImage,
  Text,
  TextInput
} from "../../ui_primitives";
import { useTimelineStore } from "../../../stores/timeline/TimelineStore";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { useEntities } from "../../../serverState/useEntities";
import { useSetupMediaImport } from "../../../hooks/timeline/useSetupMediaImport";
import type { SetupMediaImportResult } from "../../../hooks/timeline/useSetupMediaImport";
import { assetIdFromLocator } from "../../../utils/mediaRef";
import ReportBugButton from "../../support/ReportBugButton";
import { ExampleBriefs } from "../ExampleBriefs";
import { GalleryFrame } from "../MediaGallery";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { useVideoSetupContext } from "./setupContext";
import CreativeContextFields from "./CreativeContextFields";

/** How wide a carried reference thumbnail is drawn. */
const REFERENCE_THUMBNAIL = getSpacingPx(12);

/** How many example loglines are offered as inspiration (PRD § 8.1). */
const INSPIRATION_COUNT = 3;

/** What the media picker takes: the three kinds a timeline track can hold. */
export const MEDIA_ACCEPT = "video/*,audio/*,image/*";

/** The same three kinds, for files that arrive by drop rather than by picker. */
const isMediaFile = (file: File): boolean =>
  /^(video|audio|image)\//.test(file.type);

export interface IdeaStepProps {
  /** Opens an empty timeline — the flow's escape hatch, stage `done`. */
  onStartBlank: () => void;
  /**
   * Hands the brief to the script flow (E3), which sends it back finished.
   * Absent on a host that cannot open a script: the card is then offered
   * disabled with the reason, never enabled with nothing behind it.
   */
  onStartFromScript?: () => void;
  onValidationChange?: (reason: string | undefined) => void;
  /**
   * Reports an upload in progress, so the flow can hold `Continue` until the
   * dropped media is placed. A late upload otherwise lands after the stage
   * moved and the plan is drafted without it.
   */
  onImportingChange?: (importing: boolean) => void;
  /**
   * The step cannot change the draft: a run is pending or Change flow is
   * discarding it. The fieldset disables the controls, not a drop.
   */
  readOnly?: boolean;
}

/** Why the ways out of the step wait for an upload. */
const UPLOAD_PENDING_REASON = "Wait for your files to finish uploading";

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  onStartBlank,
  onStartFromScript,
  onValidationChange,
  onImportingChange,
  readOnly = false
}) => {
  const brief = useTimelineStore((state) => state.setup?.brief ?? "");
  const setSetup = useTimelineStore((state) => state.setSetup);
  const { importFiles, importing } = useSetupMediaImport();
  // Placed media lives on this draft, which the script hand-off discards.
  const hasPlacedMedia = useTimelineStore((state) => state.clips.length > 0);
  const [error, setError] = useState<string | null>(null);
  // Whether `error` is a failed import rather than a hint about the drop.
  const [importFailed, setImportFailed] = useState(false);
  const [imported, setImported] = useState<SetupMediaImportResult | null>(null);
  // Dropped files that are not media, by name. The picker cannot offer them,
  // so only a drop fills this.
  const [rejected, setRejected] = useState<string[]>([]);
  // `importing` is state, so two drops in one tick both read false. The ref
  // closes that gap.
  const importingRef = useRef(false);
  const [dragging, setDragging] = useState(false);
  const mediaInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const { data: examples } = useExampleStoryboards();
  // What the project composer was holding when the Video card was clicked
  // (F4). Shown so the creator can see it arrived rather than guessing.
  const { references, entityIds, creativeContext } = useVideoSetupContext();
  const { data: entities } = useEntities();
  const carriedEntities = useMemo(
    () => (entities ?? []).filter((entity) => entityIds.includes(entity.id)),
    [entities, entityIds]
  );

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup({ brief: event.target.value });
    },
    [setSetup]
  );

  useEffect(() => {
    onImportingChange?.(importing);
  }, [importing, onImportingChange]);
  useEffect(() => () => onImportingChange?.(false), [onImportingChange]);

  const runImport = useCallback(
    async (files: readonly File[], notMedia: string[] = []) => {
      if (files.length === 0 || importingRef.current) {
        return;
      }
      importingRef.current = true;
      setError(null);
      setImportFailed(false);
      setRejected(notMedia);
      try {
        // Drop order is the cut order, so the files are uploaded and placed in
        // the order they arrived.
        const result = await importFiles(files);
        setImported(result);
        if (!result.advanced) {
          briefField.current?.focus();
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        setImportFailed(true);
      } finally {
        importingRef.current = false;
      }
    },
    [importFiles]
  );

  const handlePicked = useCallback(
    async (event: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = "";
      await runImport(files);
    },
    [runImport]
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent) => {
      if (
        readOnly ||
        !Array.from(event.dataTransfer.types).includes("Files")
      ) {
        return;
      }
      event.preventDefault();
      setDragging(true);
    },
    [readOnly]
  );

  const handleDragLeave = useCallback(() => setDragging(false), []);

  const handleDrop = useCallback(
    async (event: React.DragEvent) => {
      const files = Array.from(event.dataTransfer.files);
      if (files.length === 0) {
        return;
      }
      event.preventDefault();
      setDragging(false);
      if (readOnly) {
        return;
      }
      if (importing || importingRef.current) {
        setImportFailed(false);
        setError("Wait for the current upload to finish, then drop again.");
        return;
      }
      const media = files.filter(isMediaFile);
      const notMedia = files
        .filter((file) => !isMediaFile(file))
        .map((file) => file.name);
      if (media.length === 0) {
        setImportFailed(false);
        setError(
          `No track takes ${notMedia.join(" · ")}. Drop video, audio or images.`
        );
        return;
      }
      await runImport(media, notMedia);
    },
    [importing, readOnly, runImport]
  );

  const skippedNames = useMemo(
    () => [
      ...rejected,
      ...(imported?.skipped ?? []).map((asset) => asset.name)
    ],
    [imported, rejected]
  );

  // The shipped boards carry briefs that work as video setup prompts. Timeline
  // examples are finished edits and do not carry those source prompts.
  const inspirations = useMemo(
    () =>
      (examples ?? [])
        .map((example) => example.logline.trim())
        .filter((logline) => logline.length > 0)
        .slice(0, INSPIRATION_COUNT),
    [examples]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "media",
        title: "Drop your media",
        description: "Video, audio and images land on the timeline in order",
        onSelect: () => mediaInput.current?.click(),
        disabled: importing,
        disabledReason: importing ? "Uploading your files…" : undefined
      },
      {
        id: "script",
        title: "Start from a script",
        description: "Write the words first, then send them to the timeline",
        onSelect: onStartFromScript ?? (() => undefined),
        // Leaving the flow mid-upload would drop the media still arriving,
        // and leaving after it would drop the clips it placed.
        disabled: !onStartFromScript || importing || hasPlacedMedia,
        disabledReason: !onStartFromScript
          ? "Not available here. Start a script from the project screen."
          : importing
            ? UPLOAD_PENDING_REASON
            : hasPlacedMedia
              ? "Your media is on this timeline and would be left behind. Plan the beats here instead."
              : undefined
      },
      {
        id: "blank",
        title: "Start with a blank timeline",
        description: "Skip the plan and cut it yourself",
        onSelect: onStartBlank,
        disabled: importing,
        disabledReason: importing ? UPLOAD_PENDING_REASON : undefined
      }
    ],
    [hasPlacedMedia, importing, onStartBlank, onStartFromScript]
  );

  return (
    <Box
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start",
        borderRadius: BORDER_RADIUS.md,
        outline: dragging ? "2px dashed" : "none",
        outlineColor: "primary.main"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            What&apos;s the video?
          </Text>
          <Text size="normal" color="secondary">
            We&apos;ll plan the beats and cut it on the timeline.
          </Text>
        </FlexColumn>

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={4}
          label="Your video"
          hideLabel
          placeholder="One sentence is enough."
          onChange={handleChange}
          inputRef={briefField}
        />

        <CreativeContextFields
          value={creativeContext}
          onValidationChange={onValidationChange}
          onChange={(value) => setSetup({ creative_context: value })}
        />

        {dragging ? (
          <Caption color="secondary" role="status">
            Drop to place your media on the timeline.
          </Caption>
        ) : null}

        {error ? (
          <AlertBanner severity="error" onClose={() => setError(null)}>
            <FlexRow gap={GAP.normal} align="center" wrap>
              <Text size="normal" component="span">
                {error}
              </Text>
              {importFailed ? (
                <ReportBugButton
                  context={{
                    source: "operation-failure",
                    summary: "Video media import failed",
                    errorText: error
                  }}
                />
              ) : null}
            </FlexRow>
          </AlertBanner>
        ) : null}

        {imported ? (
          <AlertBanner
            severity={
              imported.failed.length > 0
                ? "error"
                : skippedNames.length > 0
                  ? "warning"
                  : "info"
            }
            onClose={() => setImported(null)}
          >
            <FlexColumn gap={GAP.micro}>
              <Text size="normal" component="span">
                {`Placed ${imported.placed.length} file${
                  imported.placed.length === 1 ? "" : "s"
                } on the timeline${
                  imported.advanced ? "" : ". Say what to make of it below."
                }`}
              </Text>
              {imported.placed.length > 0 ? (
                <Caption component="span" color="secondary">
                  {imported.placed.map((asset) => asset.name).join(" · ")}
                </Caption>
              ) : null}
              {imported.failed.map((failure) => (
                <Caption key={failure.name} component="span" color="error">
                  {`${failure.name} did not upload: ${failure.reason}`}
                </Caption>
              ))}
              {imported.failed.length > 0 ? (
                <Box>
                  <ReportBugButton
                    context={{
                      source: "operation-failure",
                      summary: "Video media upload failed",
                      errorText: imported.failed
                        .map((failure) => `${failure.name}: ${failure.reason}`)
                        .join("\n")
                    }}
                  />
                </Box>
              ) : null}
              {skippedNames.length > 0 ? (
                <Caption component="span" color="secondary">
                  {`No track takes ${skippedNames.join(
                    " · "
                  )}. Video, audio and images only.`}
                </Caption>
              ) : null}
            </FlexColumn>
          </AlertBanner>
        ) : null}

        {references.length > 0 || entityIds.length > 0 ? (
          <FlexColumn
            gap={GAP.tight}
            role="group"
            aria-label="Carried from your project screen"
          >
            <Caption color="muted">From your project screen</Caption>
            {references.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {references.map((reference) => {
                  const assetId = assetIdFromLocator(reference.uri);
                  const binding = creativeContext?.reference_bindings?.find(
                    (candidate) => candidate.asset_id === assetId
                  );
                  return (
                    <FlexColumn key={reference.uri} gap={GAP.micro}>
                      <GalleryFrame
                        locator={reference.uri}
                        kind="image"
                        caption={reference.name ?? undefined}
                        label={reference.name ?? "reference image"}
                      >
                        <ResponsiveImage
                          locator={reference.uri}
                          preferThumbnail
                          alt={reference.name ?? "Reference image"}
                          fit="cover"
                          borderRadius={BORDER_RADIUS.sm}
                          showErrorFallback
                          sx={{
                            width: REFERENCE_THUMBNAIL,
                            height: REFERENCE_THUMBNAIL
                          }}
                        />
                      </GalleryFrame>
                      <Caption color="secondary">
                        {binding
                          ? `${binding.kind} conditioning`
                          : "inspiration only"}
                      </Caption>
                    </FlexColumn>
                  );
                })}
              </FlexRow>
            ) : null}
            {carriedEntities.length > 0 ? (
              <FlexRow gap={GAP.tight} wrap>
                {carriedEntities.map((entity) => (
                  <Chip
                    key={entity.id}
                    label={`${entity.name} · ${
                      creativeContext?.reference_bindings?.find(
                        (binding) => binding.entity_id === entity.id
                      )?.kind ?? "inspiration only"
                    }`}
                    size="small"
                  />
                ))}
              </FlexRow>
            ) : null}
          </FlexColumn>
        ) : null}

        <ExampleBriefs
          examples={inspirations}
          brief={brief}
          onSelect={(value) => setSetup({ brief: value })}
          briefRef={briefField}
        />
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />

      {/* The card is the control; this input only opens the picker. */}
      <input
        type="file"
        hidden
        multiple
        ref={mediaInput}
        accept={MEDIA_ACCEPT}
        aria-label="Drop your media"
        onChange={handlePicked}
      />
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "VideoIdeaStep";

export default IdeaStep;
