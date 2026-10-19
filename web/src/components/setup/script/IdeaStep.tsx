/**
 * Step 1 of the script flow — the idea (PRD § 9.1).
 *
 * A topic in a box that writes straight to the document, so `Continue` has
 * only the stage left to write and a reload resumes with the text intact
 * (D1, D3).
 *
 * The three other ways in sit beside it. Pasted and uploaded words are recorded
 * on the document as its source, apart from the brief: the writer step then
 * splits and attributes them instead of rewriting them, which is what makes an
 * imported script come out in the creator's own words (§ 9.2, criterion 4).
 *
 * The source has its own panel, and only the panel's own actions replace or
 * remove it. Typing in the brief used to re-split it as plain text, which threw
 * a screenplay's speakers and a subtitle's cue timings away (F3).
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Caption,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  GAP,
  PADDING,
  SectionHeader,
  Text,
  TextArea
} from "../../ui_primitives";
import {
  useScriptStore,
  useScriptSetup
} from "../../../stores/script/ScriptStore";
import {
  readScriptSource,
  scriptSourcePatch,
  type ImportedScript
} from "../../../lib/script/importedScript";
import { readScriptSetupContext } from "./scriptSetupContext";
import type { ScriptSetupAttachment } from "./scriptSetupContext";
import { ExampleBriefs } from "../ExampleBriefs";
import { AlternativesColumn } from "../AlternativesColumn";
import type { AlternativeEntry } from "../AlternativesColumn";
import {
  SCRIPT_SUBTITLE_ACCEPT,
  SCRIPT_TEXT_ACCEPT,
  useScriptFileImport
} from "./useScriptFileImport";

/** The § 9.1 inspiration chips. */
const INSPIRATION_KEYS = [
  "pass3_9.idea.inspirationTideClocks",
  "pass3_9.idea.inspirationPodcast",
  "pass3_9.idea.inspirationCoffeeAd"
];

export interface IdeaStepProps {
  scriptId: string;
  /** Opens a blank script — the flow's escape hatch, stage `done` (PRD § 6.2). */
  onStartBlank: () => void;
  /** Reports a file being read, so the flow can hold Continue until it lands. */
  onImportingChange?: (importing: boolean) => void;
  /** A view-mode tab: the idea shows but cannot be changed. */
  readOnly?: boolean;
}

/** What the panel says a source is, in one line. */
const sourceSummary = (
  source: ImportedScript,
  t: (key: string, options?: Record<string, unknown>) => string
): string => {
  const parts = [
    source.label,
    t("pass3_9.idea.sourceLineCount", { count: source.lines.length })
  ];
  if (source.attributed && source.speakers.length > 0) {
    parts.push(
      t("pass3_9.idea.speakers", { names: source.speakers.join(", ") })
    );
  } else {
    parts.push(t("pass3_9.idea.speakersFoundByWriter"));
  }
  if (source.lines.some((line) => line.targetDurationMs !== undefined)) {
    parts.push(t("pass3_9.idea.cueTimingsKept"));
  }
  return parts.join(" · ");
};

/** How much of the source the panel shows before it says "and N more". */
const PREVIEW_LINES = 3;

interface SourcePanelProps {
  source: ImportedScript;
  onReplace: () => void;
  onRemove: () => void;
  readOnly: boolean;
  /** A file is being read. Removing the words now would not stop it landing. */
  importing: boolean;
}

/**
 * The imported words, named and shown, with the two actions that change them.
 * Nothing else replaces a source: that is what makes an import survive being
 * edited, reloaded and written (F3).
 */
const SourcePanel: React.FC<SourcePanelProps> = ({
  source,
  onReplace,
  onRemove,
  readOnly,
  importing
}) => {
  const { t } = useTranslation();
  return (
    <FlexColumn
      gap={GAP.normal}
      padding={PADDING.comfortable}
      component="section"
      aria-label={t("pass3_9.idea.importedScript")}
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: BORDER_RADIUS.md
      }}
    >
      <FlexColumn gap={GAP.micro}>
        <SectionHeader size="small" title={t("pass3_9.idea.keptWordForWord")} />
        <Caption color="secondary" component="p">
          {sourceSummary(source, t)}
        </Caption>
      </FlexColumn>
      <FlexColumn
        gap={GAP.micro}
        component="ul"
        sx={{
          margin: 0,
          paddingLeft: 0,
          listStyle: "none",
          "& li": { listStyle: "none" }
        }}
      >
        {source.lines.slice(0, PREVIEW_LINES).map((line, index) => (
          <Caption key={`${index}-${line.text}`} component="li">
            {line.speakerName === ""
              ? line.text
              : `${line.speakerName}: ${line.text}`}
          </Caption>
        ))}
        {source.lines.length > PREVIEW_LINES ? (
          <Caption color="secondary" component="li">
            {t("pass3_9.idea.andMore", {
              count: source.lines.length - PREVIEW_LINES
            })}
          </Caption>
        ) : null}
      </FlexColumn>
      <FlexRow gap={GAP.normal} wrap>
        <EditorButton
          variant="outlined"
          size="small"
          disabled={readOnly}
          onClick={onReplace}
        >
          {t("pass3_9.idea.replaceTheseWords")}
        </EditorButton>
        <EditorButton
          variant="text"
          size="small"
          disabled={readOnly || importing}
          onClick={onRemove}
        >
          {t("pass3_9.idea.removeThem")}
        </EditorButton>
      </FlexRow>
    </FlexColumn>
  );
};

/**
 * What the project composer sent along (F4). It is shown rather than used: the
 * writer works from the brief and the source, and these are on the document so
 * the editor and the agent find them where the creator left them.
 */
const CarriedContext: React.FC<{
  attachments: readonly ScriptSetupAttachment[];
  entityCount: number;
}> = ({ attachments, entityCount }) => {
  const { t } = useTranslation();
  return (
    <FlexColumn
      gap={GAP.micro}
      component="section"
      aria-label={t("pass3_9.idea.broughtFromProject")}
    >
      <SectionHeader
        size="small"
        title={t("pass3_9.idea.broughtFromProject")}
      />
      <Caption color="secondary" component="p">
        {[
          attachments.length > 0
            ? t("pass3_9.idea.referenceCount", { count: attachments.length })
            : null,
          entityCount > 0
            ? t("pass3_9.idea.entityCount", { count: entityCount })
            : null
        ]
          .filter((part) => part !== null)
          .join(" · ")}
        {t("pass3_9.idea.keptForEditorAndAgent")}
      </Caption>
      {attachments.length > 0 ? (
        <FlexColumn
          gap={GAP.micro}
          component="ul"
          sx={{
            margin: 0,
            paddingLeft: 0,
            listStyle: "none",
            "& li": { listStyle: "none" }
          }}
        >
          {attachments.map((attachment) => (
            <Caption key={attachment.uri} component="li">
              {attachment.name}
            </Caption>
          ))}
        </FlexColumn>
      ) : null}
    </FlexColumn>
  );
};

/**
 * A Final Draft or subtitle source carries speakers or cue timings that pasted
 * text cannot, so its replacement starts empty and says what is given up.
 */
const replaceNote = (
  source: ImportedScript,
  t: (key: string) => string
): string | null => {
  if (!source.attributed) {
    return null;
  }
  return source.kind === "subtitles"
    ? t("pass3_9.idea.replaceSubtitleNote")
    : t("pass3_9.idea.replaceFinalDraftNote");
};

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  scriptId,
  onStartBlank,
  onImportingChange,
  readOnly = false
}) => {
  const { t } = useTranslation();
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const imports = useScriptFileImport(scriptId);
  useEffect(() => {
    onImportingChange?.(imports.importing);
  }, [imports.importing, onImportingChange]);
  useEffect(() => () => onImportingChange?.(false), [onImportingChange]);
  const textInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const brief = setup?.brief ?? "";
  const source = readScriptSource(setup);
  const carried = readScriptSetupContext(setup);
  const sourceNote = source ? replaceNote(source, t) : null;

  const handleChange = useCallback(
    (value: string) => {
      setSetup(scriptId, { brief: value });
    },
    [scriptId, setSetup]
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

  const usePasted = useCallback(() => {
    imports.pasteText(pasted);
    setPasting(false);
  }, [imports, pasted]);

  const replaceSource = useCallback(() => {
    // Plain text re-splits the same way, so it is offered for editing. An
    // attributed source would come back as plain text, losing its structure.
    setPasted(source && !source.attributed ? source.text : "");
    setPasting(true);
  }, [source]);

  const removeSource = useCallback(() => {
    setSetup(scriptId, scriptSourcePatch(null));
  }, [scriptId, setSetup]);

  // Every way in writes to the script, so a view-mode tab offers none, and
  // none while a file is still being read.
  const startLocked = readOnly || imports.importing;
  const startLockedReason = readOnly
    ? t("pass3_9.idea.viewOnly")
    : imports.importing
      ? t("pass3_9.idea.readingFile")
      : undefined;

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "paste",
        title: source
          ? t("pass3_9.idea.pasteDifferentWords")
          : t("pass3_9.idea.pasteYourScript"),
        description: t("pass3_9.idea.pasteDescription"),
        onSelect: () => {
          setPasted("");
          setPasting(true);
        },
        disabled: startLocked,
        disabledReason: startLockedReason
      },
      {
        id: "upload",
        title: t("pass3_9.idea.uploadFile"),
        description: t("pass3_9.idea.uploadDescription"),
        onSelect: () => textInput.current?.click(),
        disabled: startLocked,
        disabledReason: startLockedReason
      },
      {
        id: "subtitles",
        title: t("pass3_9.idea.importSubtitles"),
        description: t("pass3_9.idea.subtitlesDescription"),
        onSelect: () => subtitleInput.current?.click(),
        disabled: startLocked,
        disabledReason: startLockedReason
      },
      {
        id: "blank",
        title: t("pass3_9.idea.startBlank"),
        description: t("pass3_9.idea.startBlankDescription"),
        onSelect: onStartBlank,
        disabled: startLocked,
        disabledReason: startLockedReason
      }
    ],
    [onStartBlank, source, startLocked, startLockedReason, t]
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
            {t("pass3_9.idea.heading")}
          </Text>
          <Text size="normal" color="secondary">
            {t("pass3_9.idea.intro")}
          </Text>
        </FlexColumn>

        {carried.attachments.length > 0 || carried.entityIds.length > 0 ? (
          <CarriedContext
            attachments={carried.attachments}
            entityCount={carried.entityIds.length}
          />
        ) : null}

        {source ? (
          <SourcePanel
            source={source}
            onReplace={replaceSource}
            onRemove={removeSource}
            readOnly={readOnly}
            importing={imports.importing}
          />
        ) : null}

        <TextArea
          inputRef={briefField}
          value={brief}
          autoFocus
          rows={5}
          disabled={readOnly}
          // The words here are a brief the writer may reword. Named "Your
          // script", it told a screen reader to put the script itself here.
          label={
            source
              ? t("pass3_9.idea.notesForWriter")
              : t("pass3_9.idea.scriptAboutLabel")
          }
          hideLabel
          // A Final Draft or subtitle file already says who reads each line
          // and is applied with no model, so nothing reads a note about it.
          placeholder={
            source?.attributed
              ? t("pass3_9.idea.attributedPlaceholder")
              : source
                ? t("pass3_9.idea.importedPlaceholder")
                : t("pass3_9.idea.newScriptPlaceholder")
          }
          helperText={
            source?.attributed
              ? t("pass3_9.idea.attributedHelper")
              : source
                ? t("pass3_9.idea.importedHelper")
                : t("pass3_9.idea.newScriptHelper")
          }
          onChange={handleChange}
        />

        {imports.error ? (
          <AlertBanner severity="error" onClose={imports.clearError}>
            {imports.error}
          </AlertBanner>
        ) : null}

        {readOnly ? null : (
          <ExampleBriefs
            examples={INSPIRATION_KEYS.map((key) => t(key))}
            brief={brief}
            briefRef={briefField}
            onSelect={(value) => setSetup(scriptId, { brief: value })}
          />
        )}
      </FlexColumn>

      <AlternativesColumn
        label={t("pass3_9.idea.otherWaysToStart")}
        alternatives={alternatives}
      />

      {/* The cards are the controls; these inputs only open the picker. */}
      <input
        type="file"
        hidden
        ref={textInput}
        accept={SCRIPT_TEXT_ACCEPT}
        aria-label={t("pass3_9.idea.uploadFile")}
        onChange={handlePicked(imports.importText)}
      />
      <input
        type="file"
        hidden
        ref={subtitleInput}
        accept={SCRIPT_SUBTITLE_ACCEPT}
        aria-label={t("pass3_9.idea.importSubtitles")}
        onChange={handlePicked(imports.importSubtitles)}
      />

      <Dialog
        open={pasting}
        onClose={() => setPasting(false)}
        title={
          source
            ? t("pass3_9.idea.replaceScript")
            : t("pass3_9.idea.pasteYourScript")
        }
        showActions
        confirmText={t("pass3_9.idea.useThisText")}
        // Empty text changes nothing, so the button is held until there is some.
        confirmDisabled={pasted.trim() === ""}
        onConfirm={usePasted}
        onCancel={() => setPasting(false)}
        fullWidth
        maxWidth="sm"
      >
        <TextArea
          value={pasted}
          autoFocus
          rows={12}
          label={t("pass3_9.idea.yourScript")}
          hideLabel
          placeholder={t("pass3_9.idea.pastePlaceholder")}
          helperText={sourceNote ?? undefined}
          onChange={(value) => setPasted(value)}
        />
      </Dialog>
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "ScriptIdeaStep";

export default IdeaStep;
