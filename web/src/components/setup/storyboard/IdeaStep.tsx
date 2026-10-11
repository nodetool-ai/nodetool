/**
 * Step 1 of the storyboard flow — the idea (PRD § 7.1).
 *
 * One sentence, or a whole pasted script, in a box that writes straight to the
 * board: the brief is on the document as it is typed, so `Continue` has only
 * the stage left to write and a reload resumes with the text intact (D1, D3).
 *
 * `/` completes a skill on the New Project surface, where the prompt starts a
 * project agent. Inside the flow the text is a brief for the Director, not a
 * turn for an agent, so the skill trigger is deliberately not wired here.
 *
 * The two import paths land here as well: an uploaded script fills the same
 * textarea (§ 7.6), and a shotlist skips the story entirely and goes to
 * step 3 (§ 7.7.8).
 *
 * An FDX is different from everything else that reaches the textarea. Its
 * words and its scene order are used verbatim (D10), so the run reads the
 * parsed file, not the box — text edited freely there would be an edit the run
 * ignores. The box is therefore held while the file is the source, and the two
 * ways out are named: replace the file, or edit the script as text and let the
 * Director structure it (F3).
 */

import React, { memo, useCallback, useEffect, useMemo, useRef } from "react";

import {
  AlertBanner,
  Box,
  Caption,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useStoryboardStore } from "../../../stores/storyboard/StoryboardStore";
import { useImportSource } from "../../../hooks/storyboard/useImportSource";
import { storyboardCreativeContextOf } from "../../../hooks/storyboard/directionFingerprint";
import CreativeContextFields from "../video/CreativeContextFields";
import {
  clearImport,
  releaseImportedStructure
} from "../../../lib/storyboard/importSource";
import { useExampleStoryboards } from "../../../hooks/storyboard/useStoryboards";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import { ExampleBriefs } from "../ExampleBriefs";
import ReportBugButton from "../../support/ReportBugButton";
import { ShotlistReport } from "./ShotlistReport";
import { SCRIPT_ACCEPT, useScriptImport } from "./useScriptImport";
import {
  SHOTLIST_ACCEPT,
  SHOTLIST_TEMPLATE_URL,
  useShotlistImport
} from "./useShotlistImport";

/** How many example loglines are offered as inspiration (PRD § 7.1). */
const INSPIRATION_COUNT = 3;

export interface IdeaStepProps {
  boardId: string;
  /** Opens a blank board — the flow's escape hatch, stage `done` (PRD § 6.2). */
  onStartBlank: () => void;
  /** Opens the existing tutorials entry. */
  onOpenTutorial: () => void;
  onValidationChange?: (reason: string | undefined) => void;
  /**
   * Reports a file being read, so the flow holds Continue until it lands. A
   * late import that found the step moved on writes nothing (F9).
   */
  onImportingChange?: (importing: boolean) => void;
  /** View mode: the step shows what was written and changes nothing. */
  readOnly?: boolean;
}

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  boardId,
  onStartBlank,
  onOpenTutorial,
  onValidationChange,
  onImportingChange,
  readOnly = false
}) => {
  const brief = useStoryboardStore(
    (state) => state.boards[boardId]?.brief ?? ""
  );
  const setSetup = useStoryboardStore((state) => state.setSetup);
  const creativeContext = useStoryboardStore(
    (state) => state.boards[boardId]?.creativeContext
  );
  const screenplay = useStoryboardStore(
    (state) => state.boards[boardId]?.screenplay
  );
  const { data: examples } = useExampleStoryboards();
  const script = useScriptImport(boardId);
  const shotlist = useShotlistImport(boardId);
  const scriptInput = useRef<HTMLInputElement>(null);
  const shotlistInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const importing = script.importing || shotlist.importing;
  useEffect(() => {
    onImportingChange?.(importing);
  }, [importing, onImportingChange]);
  useEffect(() => () => onImportingChange?.(false), [onImportingChange]);
  const source = useImportSource(boardId);
  const locked = source?.preserveWords === true;

  const replaceSource = useCallback(() => {
    if (!readOnly) {
      scriptInput.current?.click();
    }
  }, [readOnly]);
  const editAsText = useCallback(() => {
    if (!readOnly) {
      releaseImportedStructure(boardId);
    }
  }, [boardId, readOnly]);
  const removeSource = useCallback(() => {
    if (!readOnly) {
      clearImport(boardId);
    }
  }, [boardId, readOnly]);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      if (!readOnly) {
        setSetup(boardId, { brief: event.target.value });
      }
    },
    [boardId, readOnly, setSetup]
  );

  // The picked file is read once; resetting the value lets the same file be
  // picked again after a refusal.
  const handlePicked = useCallback(
    (importFile: (file: File) => Promise<void>) =>
      (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (file) {
          void importFile(file);
        }
      },
    []
  );

  // The shipped boards' own briefs: what someone typed to get a board that
  // exists, which is a better start than an invented example.
  const inspirations = useMemo(
    () =>
      (examples ?? [])
        .map((example) => example.logline.trim())
        .filter((logline) => logline.length > 0 && logline !== brief.trim())
        .slice(0, INSPIRATION_COUNT),
    [brief, examples]
  );

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "upload",
        title: "Upload your file",
        description: "PDF, DOCX, FDX",
        onSelect: () => scriptInput.current?.click(),
        disabled: readOnly || importing,
        disabledReason: importing ? "Reading your file…" : undefined
      },
      {
        id: "shotlist",
        title: "Import your shotlist",
        description: "CSV, one row per shot",
        onSelect: () => shotlistInput.current?.click(),
        disabled: readOnly || importing,
        disabledReason: importing ? "Reading your file…" : undefined
      },
      {
        id: "blank",
        title: "Start with a blank storyboard",
        description: "Skip the story and go straight to the board",
        onSelect: onStartBlank,
        disabled: readOnly
      },
      {
        id: "tutorial",
        title: "Take the tutorial",
        description: "Walk one board end to end, with the steps explained",
        onSelect: onOpenTutorial
      }
    ],
    [importing, onOpenTutorial, onStartBlank, readOnly]
  );

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: {
          xs: "1fr",
          md: "minmax(0, 2fr) minmax(240px, 1fr)"
        },
        gap: GAP.spacious,
        alignItems: "start"
      }}
    >
      <FlexColumn gap={GAP.comfortable}>
        <FlexColumn gap={GAP.tight}>
          <Text size="big" component="h2">
            What&apos;s your story?
          </Text>
          <Text size="normal" color="secondary">
            We&apos;ll turn it into a screenplay and storyboard.
          </Text>
        </FlexColumn>

        <CreativeContextFields
          value={creativeContext ?? storyboardCreativeContextOf(screenplay)}
          onValidationChange={onValidationChange}
          readOnly={readOnly}
          onChange={(value) => {
            if (!readOnly) {
              setSetup(boardId, { creative_context: value });
            }
          }}
        />

        {source ? (
          <AlertBanner
            severity="info"
            title={`Imported from ${source.fileName}`}
          >
            <FlexColumn gap={GAP.tight}>
              <Caption component="span">
                {locked
                  ? "Your scenes and dialogue are used as written. The Director only adds camera, motion and timing."
                  : "The Director structures this text into scenes and shots."}
              </Caption>
              <FlexRow gap={GAP.normal} wrap>
                <EditorButton
                  variant="outlined"
                  size="small"
                  onClick={replaceSource}
                  disabled={readOnly || importing}
                >
                  Replace file
                </EditorButton>
                {locked ? (
                  <EditorButton
                    variant="text"
                    size="small"
                    onClick={editAsText}
                    disabled={readOnly || importing}
                  >
                    Edit as text
                  </EditorButton>
                ) : (
                  <EditorButton
                    variant="text"
                    size="small"
                    onClick={removeSource}
                    disabled={readOnly || importing}
                  >
                    Remove the file
                  </EditorButton>
                )}
              </FlexRow>
            </FlexColumn>
          </AlertBanner>
        ) : null}

        <TextInput
          value={brief}
          autoFocus={!locked && !readOnly}
          multiline
          rows={5}
          label="Your story"
          hideLabel
          placeholder="One sentence is enough, or paste a full script."
          onChange={handleChange}
          inputRef={briefField}
          slotProps={{ input: { readOnly: locked || readOnly } }}
          helperText={
            locked
              ? "Held while your file is the script. Edit as text to change the words here."
              : undefined
          }
        />

        {/* The Report control sits in the body: an `action` would replace
            the banner's close button. */}
        {script.error ? (
          <AlertBanner severity="error" onClose={script.clearError}>
            <FlexColumn gap={GAP.tight} align="flex-start">
              {script.error}
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: "Storyboard script import failed",
                  errorText: script.error
                }}
              />
            </FlexColumn>
          </AlertBanner>
        ) : null}
        {shotlist.error ? (
          <AlertBanner severity="error" onClose={shotlist.clearError}>
            <FlexColumn gap={GAP.tight} align="flex-start">
              {shotlist.error}
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: "Storyboard shotlist import failed",
                  errorText: shotlist.error
                }}
              />
            </FlexColumn>
          </AlertBanner>
        ) : null}

        {/* An example would replace the held script with a line the camera
            pass ignores, and "Edit as text" would then start from it. */}
        {readOnly || locked ? null : (
          <ExampleBriefs
            examples={inspirations}
            brief={brief}
            onSelect={(value) => setSetup(boardId, { brief: value })}
            briefRef={briefField}
          />
        )}
      </FlexColumn>

      {/* The other four flows put their entry paths in a column beside the
          box, and this one is read alongside them. The shotlist template sits
          under the rail, next to the card that needs it. */}
      <FlexColumn gap={GAP.normal}>
        <AlternativesColumn
          label="Other ways to start"
          alternatives={alternatives}
        />
        <Caption color="secondary" component="p">
          <a href={SHOTLIST_TEMPLATE_URL} download>
            Download the CSV template
          </a>
        </Caption>
      </FlexColumn>

      {/* The cards are the controls; these inputs only open the picker. */}
      <input
        type="file"
        hidden
        ref={scriptInput}
        accept={SCRIPT_ACCEPT}
        aria-label="Upload your file"
        onChange={handlePicked(script.importFile)}
      />
      <input
        type="file"
        hidden
        ref={shotlistInput}
        accept={SHOTLIST_ACCEPT}
        aria-label="Import your shotlist"
        onChange={handlePicked(shotlist.importFile)}
      />

      <ShotlistReport
        open={shotlist.report !== null}
        shotCount={shotlist.shotCount}
        entries={shotlist.report ?? []}
        onClose={shotlist.dismissReport}
      />
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "IdeaStep";

export default IdeaStep;
