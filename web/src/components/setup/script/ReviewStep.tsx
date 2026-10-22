/**
 * Step 2's review — the script before anything is voiced (PRD § 9.2, D4).
 *
 * The script laid out the way the editor prints it: a plain page, a heading
 * per section when there is more than one, and each line's speaker in the gutter, its direction in italics and its
 * words beside them, all editable in place. Text and speaker edits go through
 * the same handler the `ui_script_set_line_text` and `ui_script_set_speaker`
 * tools call, so what a creator can fix here an agent can fix headlessly and
 * neither path can drift from the other (§ 9.6, criterion 6).
 *
 * Nothing here spends anything: no take is recorded and no provider is called
 * until step 3's button — except `Rewrite`, which is a writer call, and so sits
 * with its model and the estimate line every secondary paid action in the
 * flows carries (F23).
 *
 * A script can also end here. “Open the editor without voicing” writes stage
 * `done` and hands the text over, because a script is a finished thing whether
 * or not anyone reads it out; the only way to leave with text used to be to go
 * back to step 1 and start blank (F16).
 */

import React, { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ChangeEvent } from "react";
import AddIcon from "@mui/icons-material/AddOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import TheaterComedyIcon from "@mui/icons-material/TheaterComedy";
import {
  countScriptWords,
  estimateSpokenSeconds,
  type ScriptPaceId
} from "@nodetool-ai/protocol";

import useGlobalChatStore from "../../../stores/GlobalChatStore";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import type {
  ScriptLine,
  ScriptSection,
  ScriptSpeaker
} from "../../../stores/script/ScriptStore";
import { getScriptAgentHandler } from "../../../components/script/scriptAgentBridge";
import { ScriptSpeakerPicker } from "../../../components/script/ScriptSpeakerPicker";
import LanguageModelSelect from "../../properties/LanguageModelSelect";
import ReportBugButton from "../../support/ReportBugButton";
import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  MOTION,
  SPACING,
  SPACING_PX,
  Text,
  TextArea,
  TextInput,
  ToolbarIconButton,
  TYPOGRAPHY,
  reducedMotion
} from "../../ui_primitives";
import type { LanguageModelValue } from "../../../stores/ApiTypes";
import { readScriptSource } from "../../../lib/script/importedScript";
import { GenerationEstimateLine } from "../GenerationSummary";

/** A duration as the review states it: seconds under a minute, else m:ss. */
const spokenLength = (seconds: number): string => {
  const rounded = Math.round(seconds);
  if (rounded < 60) {
    return `${rounded}s`;
  }
  return `${Math.floor(rounded / 60)}m ${String(rounded % 60).padStart(2, "0")}s`;
};

/** The picker holds one model name; left free it outweighs the script. */
const MODEL_PICKER_WIDTH = 240;

/** What a rewrite is allowed to write, matching step 2's own budget. */
const REWRITE_MAX_TOKENS = 8192;

/**
 * The script reads as a page: wide enough for the speaker gutter and a line of
 * dialogue at a comfortable measure, and no wider.
 */
const SCRIPT_REVIEW_WIDTH = 880;

/** The speaker column: a dot and a name, which truncates past this width. */
const SPEAKER_COLUMN = 112;

/** Below this card width the speaker sits above the words. */
const STACK_BELOW = 560;

const wordsIn = (lines: readonly ScriptLine[]): number =>
  lines.reduce((sum, line) => sum + countScriptWords(line.text), 0);

/**
 * A field that reads as part of the page until its line is pointed at: the
 * box shows when the pointer is on the line and when the field has focus. A
 * box on every line at rest made the script read as a form, not a page.
 */
const quietOutline = {
  "& .MuiOutlinedInput-root.MuiInputBase-root": {
    backgroundColor: "transparent",
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: "transparent",
      transition: MOTION.border
    },
    "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: "divider" },
    "&.Mui-focused .MuiOutlinedInput-notchedOutline": {
      borderColor: "primary.main"
    }
  }
} as const;

const directionFieldSx = {
  ...quietOutline,
  "& .MuiOutlinedInput-input": {
    ...TYPOGRAPHY.sans.label,
    fontStyle: "italic",
    color: "text.secondary"
  }
} as const;

const lineFieldSx = {
  ...quietOutline,
  "& .MuiOutlinedInput-input": {
    ...TYPOGRAPHY.sans.body,
    color: "text.primary"
  }
} as const;

interface ReviewLineProps {
  scriptId: string;
  line: ScriptLine;
  cast: readonly ScriptSpeaker[];
  locked: boolean;
}

/** One line of the script: speaker, direction, words, and its two actions. */
const ReviewLine: React.FC<ReviewLineProps> = memo(
  ({ scriptId, line, cast, locked }) => {
    const { t } = useTranslation();
    const [directionOpen, setDirectionOpen] = useState(false);
    const speaker = cast.find((entry) => entry.id === line.speakerId) ?? null;
    const hasDirection = line.direction !== undefined && line.direction !== "";
    const showDirection = hasDirection || directionOpen;

    const setText = useCallback(
      (value: string) =>
        getScriptAgentHandler(scriptId).setLineText(line.id, value),
      [line.id, scriptId]
    );
    const setSpeaker = useCallback(
      (speakerId: string | null) =>
        getScriptAgentHandler(scriptId).setLineSpeaker(line.id, speakerId),
      [line.id, scriptId]
    );
    // The editor writes a direction straight onto the line, and so does the
    // review: the two are the same field.
    const setDirection = useCallback(
      (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        useScriptStore
          .getState()
          .patchLine(scriptId, line.id, { direction: event.target.value }),
      [line.id, scriptId]
    );
    const toggleDirection = useCallback(() => {
      if (showDirection) {
        useScriptStore
          .getState()
          .patchLine(scriptId, line.id, { direction: "" });
        setDirectionOpen(false);
      } else {
        setDirectionOpen(true);
      }
    }, [line.id, scriptId, showDirection]);
    const remove = useCallback(
      () => useScriptStore.getState().removeLine(scriptId, line.id),
      [line.id, scriptId]
    );

    // Every row has the same two icons, so each names the line it acts on.
    const words = line.text.trim().split(/\s+/).filter(Boolean);
    const excerpt =
      words.length === 0
        ? t("pass3_9.review.emptyLine")
        : t("pass3_9.review.lineExcerpt", {
            text: words.slice(0, 4).join(" "),
            ellipsis: words.length > 4 ? "…" : ""
          });

    return (
      <Box
        data-line-id={line.id}
        sx={{
          display: "grid",
          gridTemplateColumns: `${SPEAKER_COLUMN}px minmax(0, 1fr) auto`,
          columnGap: `${SPACING_PX.lg}px`,
          rowGap: SPACING.sm,
          alignItems: "start",
          paddingX: SPACING.md,
          paddingY: SPACING.xs,
          borderRadius: BORDER_RADIUS.sm,
          transition: MOTION.background,
          ...reducedMotion({ transition: MOTION.none }),
          "&:hover": { backgroundColor: "action.hover" },
          "&:hover .MuiOutlinedInput-notchedOutline": {
            borderColor: "divider"
          },
          "& .review-line-actions": {
            opacity: 0,
            transition: MOTION.opacity
          },
          "&:hover .review-line-actions, &:focus-within .review-line-actions": {
            opacity: 1
          },
          [`@container script-review (max-width: ${STACK_BELOW}px)`]: {
            gridTemplateColumns: "minmax(0, 1fr) auto",
            "& > .review-line-speaker": { gridColumn: "1 / 2" },
            "& > .review-line-words": { gridColumn: "1 / 3" },
            "& > .review-line-actions": { gridColumn: "2 / 3", gridRow: "1" }
          }
        }}
      >
        <FlexColumn
          className="review-line-speaker"
          gap={GAP.tight}
          sx={{ minWidth: 0, paddingTop: SPACING.xs }}
        >
          <ScriptSpeakerPicker
            scriptId={scriptId}
            lineId={line.id}
            speaker={speaker}
            cast={cast}
            readOnly={locked}
            mobile={false}
            onAssign={setSpeaker}
            quiet
          />
          {/* A subtitle import brought its own timing, and the take has to
              hit it — so it shows beside the words it belongs to rather than
              sitting unseen on the document (PRD § 9.1). */}
          {line.targetDurationMs === undefined ? null : (
            <Caption color="muted">
              {t("pass3_9.review.targetDuration", {
                seconds: (line.targetDurationMs / 1000).toFixed(1)
              })}
            </Caption>
          )}
        </FlexColumn>

        <FlexColumn
          className="review-line-words"
          gap={GAP.micro}
          sx={{ minWidth: 0 }}
        >
          {showDirection ? (
            <TextInput
              autoFocus={!hasDirection}
              value={line.direction ?? ""}
              onChange={setDirection}
              placeholder={t("pass3_9.review.directionPlaceholder")}
              hideLabel
              label={t("pass3_9.review.direction")}
              compact
              fullWidth
              slotProps={{ input: { readOnly: locked } }}
              sx={directionFieldSx}
            />
          ) : null}
          <TextArea
            value={line.text}
            onChange={setText}
            placeholder={t("pass3_9.review.linePlaceholder")}
            minRows={1}
            hideLabel
            label={t("pass3_9.review.line")}
            compact
            fullWidth
            slotProps={{ input: { readOnly: locked } }}
            sx={lineFieldSx}
          />
        </FlexColumn>

        {locked ? (
          <Box className="review-line-actions" />
        ) : (
          <FlexRow
            className="review-line-actions"
            gap={GAP.micro}
            align="center"
            sx={{ paddingTop: SPACING.xs }}
          >
            <ToolbarIconButton
              icon={<TheaterComedyIcon fontSize="small" />}
              tooltip={
                showDirection
                  ? t("pass3_9.review.deleteDirection")
                  : t("pass3_9.review.addDirection")
              }
              ariaLabel={t(
                showDirection
                  ? "pass3_9.review.deleteDirectionFrom"
                  : "pass3_9.review.addDirectionTo",
                { excerpt }
              )}
              onClick={toggleDirection}
            />
            <ToolbarIconButton
              icon={<DeleteOutlineIcon fontSize="small" />}
              tooltip={t("pass3_9.review.deleteLine")}
              ariaLabel={t("pass3_9.review.deleteLineExcerpt", { excerpt })}
              variant="error"
              onClick={remove}
            />
          </FlexRow>
        )}
      </Box>
    );
  }
);
ReviewLine.displayName = "ScriptReviewLine";

interface ReviewSectionProps {
  scriptId: string;
  section: ScriptSection;
  cast: readonly ScriptSpeaker[];
  pace: ScriptPaceId;
  locked: boolean;
  /** One section repeats the step's own totals, so its header is left out. */
  showHeader: boolean;
}

/** A section of the script: its name and size, then its lines. */
const ReviewSection: React.FC<ReviewSectionProps> = memo(
  ({ scriptId, section, cast, pace, locked, showHeader }) => {
    const { t } = useTranslation();
    const title = section.title ?? t("pass3_9.review.script");
    const words = wordsIn(section.lines);

    // The step asks for at least one line with words in it, so each section
    // carries the control that produces one (F20). The new line goes to the
    // speaker the section ended on, so it does not open blocked on a speaker.
    const addLine = useCallback(() => {
      const lastSpeaker = section.lines.at(-1)?.speakerId ?? null;
      const lineId = useScriptStore.getState().addLine(scriptId, section.id);
      if (lastSpeaker) {
        getScriptAgentHandler(scriptId).setLineSpeaker(lineId, lastSpeaker);
      }
    }, [scriptId, section.id, section.lines]);

    return (
      <Box
        component="section"
        aria-label={title}
        sx={{
          containerType: "inline-size",
          containerName: "script-review"
        }}
      >
        {showHeader ? (
          <FlexRow
            gap={GAP.normal}
            align="baseline"
            wrap
            sx={{ paddingX: SPACING.md, paddingBottom: SPACING.sm }}
          >
            <Text size="normal" weight={600} component="h3">
              {title}
            </Text>
            <Caption color="muted">
              {t("pass3_9.review.sectionSummary", {
                count: section.lines.length,
                duration: spokenLength(estimateSpokenSeconds(words, pace))
              })}
            </Caption>
          </FlexRow>
        ) : null}
        {section.lines.map((line) => (
          <ReviewLine
            key={line.id}
            scriptId={scriptId}
            line={line}
            cast={cast}
            locked={locked}
          />
        ))}
        <Box sx={{ paddingX: SPACING.md, paddingTop: SPACING.xs }}>
          <EditorButton
            variant="text"
            size="small"
            startIcon={<AddIcon />}
            disabled={locked}
            onClick={addLine}
            aria-label={t("pass3_9.review.addLineTo", { title })}
          >
            {t("i18n-next115.scriptReview.addLine")}
          </EditorButton>
        </Box>
      </Box>
    );
  }
);
ReviewSection.displayName = "ScriptReviewSection";

export interface ReviewStepProps {
  scriptId: string;
  /** Reruns the writer with the edited script as context. */
  onRewrite: () => void;
  /**
   * True while `Rewrite` runs. The lines are read-only meanwhile: the
   * writer's answer replaces them, so an edit made now would be lost.
   */
  rewriting?: boolean;
  /** Why the last write or rewrite failed, shown under the script. */
  error?: string | null;
  /** Finishes setup on the text alone: stage `done`, no voices, no audio. */
  onOpenEditor: () => void;
  /** A view-mode tab: the script shows but cannot be changed. */
  readOnly?: boolean;
}

const ReviewStepInternal: React.FC<ReviewStepProps> = ({
  scriptId,
  onRewrite,
  rewriting = false,
  error,
  onOpenEditor,
  readOnly = false
}) => {
  const { t } = useTranslation();
  // Nothing on the step may change the script: not while a rewrite replaces
  // the lines, and not in a view-mode tab.
  const locked = rewriting || readOnly;
  const script = useScriptStore((state) => state.scripts[scriptId]);
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const pace = (setup?.pace ?? "normal") as ScriptPaceId;
  const source = readScriptSource(setup);
  // Until the picker is touched the writer runs on the chat model, so that is
  // what the picker shows — a blank control would claim no model is set while
  // the rewrite would happily use one.
  const chatModel = useGlobalChatStore((state) => state.selectedModel);
  const writerModel = setup?.writer_model ?? chatModel ?? null;
  const sections = useMemo(() => script?.sections ?? [], [script?.sections]);
  const cast = useMemo(() => script?.cast ?? [], [script?.cast]);

  const setWriterModel = useCallback(
    (value: LanguageModelValue) => {
      setSetup(scriptId, {
        writer_model: { provider: value.provider, id: value.id }
      });
    },
    [scriptId, setSetup]
  );

  const addFirstLine = useCallback(() => {
    useScriptStore.getState().addLine(scriptId);
  }, [scriptId]);

  const emptyLineIds = useMemo(
    () =>
      sections.flatMap((section) =>
        section.lines
          .filter((line) => line.text.trim() === "")
          .map((line) => line.id)
      ),
    [sections]
  );
  const removeEmptyLines = useCallback(() => {
    const { removeLine } = useScriptStore.getState();
    emptyLineIds.forEach((lineId) => removeLine(scriptId, lineId));
  }, [emptyLineIds, scriptId]);

  const lineCount = sections.reduce(
    (count, section) => count + section.lines.length,
    0
  );
  const words = useMemo(
    () =>
      sections.reduce((total, section) => total + wordsIn(section.lines), 0),
    [sections]
  );

  // A rewrite sends the script as it stands along with the brief, so the
  // estimate prices both.
  const estimatedInput = useMemo(
    () =>
      [
        setup?.brief ?? "",
        ...sections.flatMap((section) => section.lines.map((line) => line.text))
      ].join("\n"),
    [sections, setup?.brief]
  );

  return (
    <FlexColumn
      gap={GAP.spacious}
      sx={{ width: "100%", maxWidth: SCRIPT_REVIEW_WIDTH }}
    >
      {/* The heading on the left, the step's one paid action on the right:
          the layout the storyboard's Find entities uses. */}
      <FlexRow
        gap={GAP.spacious}
        align="flex-start"
        justify="space-between"
        wrap
      >
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            {t("pass3_9.review.heading")}
          </Text>
          <Caption color="secondary" component="p">
            {t("pass3_9.review.wordSummary", {
              count: words,
              duration: spokenLength(estimateSpokenSeconds(words, pace)),
              pace
            })}
          </Caption>
        </FlexColumn>
        <FlexColumn gap={GAP.tight} align="flex-end">
          <FlexRow gap={GAP.normal} align="center">
            <Box sx={{ width: MODEL_PICKER_WIDTH }}>
              <LanguageModelSelect
                value={writerModel?.id ?? ""}
                provider={writerModel?.provider}
                placeholder={t("pass3_9.review.writerModel")}
                disabled={readOnly}
                onChange={setWriterModel}
              />
            </Box>
            <EditorButton
              variant="outlined"
              disabled={locked}
              onClick={onRewrite}
            >
              {rewriting
                ? t("pass3_9.review.rewriting")
                : t("pass3_9.review.rewrite")}
            </EditorButton>
          </FlexRow>
          {/* A rewrite is a model call like any other, so it says what it
              will cost before it is pressed rather than after (F23). */}
          <GenerationEstimateLine
            result={t("pass3_9.review.rewriteEstimate", { count: words })}
            next={t("pass3_9.review.rewriteContext")}
            model={writerModel}
            brief={estimatedInput}
            maxOutputTokens={REWRITE_MAX_TOKENS}
            hideModel
          />
          {source ? (
            <Caption color="warning" component="p">
              {t("pass3_9.review.rewriteReplacesImported")}
            </Caption>
          ) : null}
        </FlexColumn>
      </FlexRow>

      {emptyLineIds.length > 0 ? (
        <AlertBanner
          severity="info"
          action={
            <EditorButton
              variant="text"
              size="small"
              disabled={locked}
              onClick={removeEmptyLines}
            >
              {t("pass3_9.review.deleteEmptyLines", {
                count: emptyLineIds.length
              })}
            </EditorButton>
          }
        >
          {t("pass3_9.review.emptyLinesNotice", { count: emptyLineIds.length })}
        </AlertBanner>
      ) : null}

      {error ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "provider-call",
                summary: t("pass3_9.review.rewriteFailed"),
                errorText: error
              }}
            />
          }
        >
          {error}
        </AlertBanner>
      ) : null}

      <FlexColumn gap={GAP.spacious}>
        {sections.map((section) => (
          <ReviewSection
            key={section.id}
            scriptId={scriptId}
            section={section}
            cast={cast}
            pace={pace}
            locked={locked}
            showHeader={sections.length > 1}
          />
        ))}
        {lineCount === 0 && sections.length === 0 ? (
          <Box sx={{ paddingX: SPACING.md }}>
            <EditorButton
              variant="outlined"
              startIcon={<AddIcon />}
              disabled={locked}
              onClick={addFirstLine}
            >
              {t("pass3_9.review.addLine")}
            </EditorButton>
          </Box>
        ) : null}
      </FlexColumn>

      <FlexRow gap={GAP.normal} align="center" wrap>
        <EditorButton
          variant="text"
          size="small"
          disabled={readOnly}
          onClick={onOpenEditor}
        >
          {t("pass3_9.review.openEditor")}
        </EditorButton>
        <Caption color="secondary">
          {t("pass3_9.review.finishWithText")}
        </Caption>
      </FlexRow>
    </FlexColumn>
  );
};

export const ReviewStep = memo(ReviewStepInternal);
ReviewStep.displayName = "ScriptReviewStep";

export default ReviewStep;
