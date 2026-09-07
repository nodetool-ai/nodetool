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

import React, { memo, useCallback, useMemo, useRef, useState } from "react";

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
  Label,
  PADDING,
  Text,
  TextInput
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
const INSPIRATIONS = [
  "A 60-second explainer about how tide clocks work",
  "A podcast intro for a show about failed products",
  "An ad read for a coffee subscription"
];

export interface IdeaStepProps {
  scriptId: string;
  /** Opens a blank script — the flow's escape hatch, stage `done` (PRD § 6.2). */
  onStartBlank: () => void;
}

/** What the panel says a source is, in one line. */
const sourceSummary = (source: ImportedScript): string => {
  const parts = [`${source.label}`, `${source.lines.length} lines`];
  if (source.attributed && source.speakers.length > 0) {
    parts.push(`speakers: ${source.speakers.join(", ")}`);
  } else {
    parts.push("speakers found by the writer");
  }
  if (source.lines.some((line) => line.targetDurationMs !== undefined)) {
    parts.push("cue timings kept");
  }
  return parts.join(" · ");
};

/** How much of the source the panel shows before it says "and N more". */
const PREVIEW_LINES = 3;

interface SourcePanelProps {
  source: ImportedScript;
  onReplace: () => void;
  onRemove: () => void;
}

/**
 * The imported words, named and shown, with the two actions that change them.
 * Nothing else replaces a source: that is what makes an import survive being
 * edited, reloaded and written (F3).
 */
const SourcePanel: React.FC<SourcePanelProps> = ({
  source,
  onReplace,
  onRemove
}) => (
  <FlexColumn
    gap={GAP.normal}
    padding={PADDING.comfortable}
    component="section"
    aria-label="Imported script"
    sx={{
      border: "1px solid",
      borderColor: "divider",
      borderRadius: BORDER_RADIUS.md
    }}
  >
    <FlexColumn gap={GAP.micro}>
      <Label>Your script, kept word for word</Label>
      <Caption color="secondary" component="p">
        {sourceSummary(source)}
      </Caption>
    </FlexColumn>
    <FlexColumn
      gap={GAP.micro}
      component="ul"
      sx={{ margin: 0, paddingLeft: 0, listStyle: "none", "& li": { listStyle: "none" } }}
    >
      {source.lines.slice(0, PREVIEW_LINES).map((line, index) => (
        <Caption key={`${index}-${line.text}`} component="li">
          {line.speakerName === "" ? line.text : `${line.speakerName}: ${line.text}`}
        </Caption>
      ))}
      {source.lines.length > PREVIEW_LINES ? (
        <Caption color="secondary" component="li">
          {`and ${source.lines.length - PREVIEW_LINES} more`}
        </Caption>
      ) : null}
    </FlexColumn>
    <FlexRow gap={GAP.normal} wrap>
      <EditorButton variant="outlined" size="small" onClick={onReplace}>
        Replace these words
      </EditorButton>
      <EditorButton variant="text" size="small" onClick={onRemove}>
        Remove them
      </EditorButton>
    </FlexRow>
  </FlexColumn>
);

/**
 * What the project composer sent along (F4). It is shown rather than used: the
 * writer works from the brief and the source, and these are on the document so
 * the editor and the agent find them where the creator left them.
 */
const CarriedContext: React.FC<{
  attachments: readonly ScriptSetupAttachment[];
  entityCount: number;
}> = ({ attachments, entityCount }) => (
  <FlexColumn
    gap={GAP.micro}
    component="section"
    aria-label="Brought from your project"
  >
    <Label>Brought from your project</Label>
    <Caption color="secondary" component="p">
      {[
        attachments.length > 0
          ? `${attachments.length} ${attachments.length === 1 ? "reference" : "references"}`
          : null,
        entityCount > 0
          ? `${entityCount} ${entityCount === 1 ? "entity" : "entities"}`
          : null
      ]
        .filter((part) => part !== null)
        .join(" · ")}
      {" — kept on the script for the editor and the agent."}
    </Caption>
    {attachments.length > 0 ? (
      <FlexColumn
        gap={GAP.micro}
        component="ul"
        sx={{ margin: 0, paddingLeft: 0, listStyle: "none", "& li": { listStyle: "none" } }}
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

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  scriptId,
  onStartBlank
}) => {
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const imports = useScriptFileImport(scriptId);
  const textInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const briefField = useRef<HTMLElement | null>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const brief = setup?.brief ?? "";
  const source = readScriptSource(setup);
  const carried = readScriptSetupContext(setup);

  const handleChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setSetup(scriptId, { brief: event.target.value });
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
    setPasted(source?.text ?? "");
    setPasting(true);
  }, [source]);

  const removeSource = useCallback(() => {
    setSetup(scriptId, scriptSourcePatch(null));
  }, [scriptId, setSetup]);

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "paste",
        title: source ? "Paste different words" : "Paste your script",
        description: "Words you already have, kept exactly as you wrote them",
        onSelect: () => {
          setPasted("");
          setPasting(true);
        }
      },
      {
        id: "upload",
        title: "Upload a file",
        description: "TXT, PDF, DOCX or Final Draft",
        onSelect: () => textInput.current?.click(),
        disabled: imports.importing,
        disabledReason: imports.importing ? "Reading your file…" : undefined
      },
      {
        id: "subtitles",
        title: "Import subtitles",
        description: "SRT or VTT — each cue becomes a timed line",
        onSelect: () => subtitleInput.current?.click(),
        disabled: imports.importing,
        disabledReason: imports.importing ? "Reading your file…" : undefined
      },
      {
        id: "blank",
        title: "Start with a blank script",
        description: "Skip the questions and write it yourself",
        onSelect: onStartBlank
      }
    ],
    [imports.importing, onStartBlank, source]
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
            What&apos;s the script about?
          </Text>
          <Text size="normal" color="secondary">
            We&apos;ll write it in lines you can voice.
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
          />
        ) : null}

        <TextInput
          inputRef={briefField}
          value={brief}
          autoFocus
          multiline
          rows={5}
          label={source ? "Notes for the writer" : "Your script"}
          hideLabel
          placeholder={
            source
              ? "Optional: say who reads what, or how to split the lines."
              : "Describe the topic, audience and message for a new script."
          }
          helperText={
            source
              ? "Your imported words are kept as written. Anything here only guides how they are split and who reads them."
              : "Text entered here is a writing brief and may be rewritten. Use Paste your script or Upload a file to preserve existing words."
          }
          onChange={handleChange}
        />

        {imports.error ? (
          <AlertBanner severity="error" onClose={imports.clearError}>
            {imports.error}
          </AlertBanner>
        ) : null}

        <ExampleBriefs
          examples={INSPIRATIONS}
          brief={brief}
          briefRef={briefField}
          onSelect={(value) => setSetup(scriptId, { brief: value })}
        />
      </FlexColumn>

      <AlternativesColumn
        label="Other ways to start"
        alternatives={alternatives}
      />

      {/* The cards are the controls; these inputs only open the picker. */}
      <input
        type="file"
        hidden
        ref={textInput}
        accept={SCRIPT_TEXT_ACCEPT}
        aria-label="Upload a file"
        onChange={handlePicked(imports.importText)}
      />
      <input
        type="file"
        hidden
        ref={subtitleInput}
        accept={SCRIPT_SUBTITLE_ACCEPT}
        aria-label="Import subtitles"
        onChange={handlePicked(imports.importSubtitles)}
      />

      <Dialog
        open={pasting}
        onClose={() => setPasting(false)}
        title={source ? "Replace your script" : "Paste your script"}
        showActions
        confirmText="Use this text"
        onConfirm={usePasted}
        onCancel={() => setPasting(false)}
        fullWidth
        maxWidth="sm"
      >
        <TextInput
          value={pasted}
          autoFocus
          multiline
          rows={12}
          label="Your script"
          hideLabel
          placeholder="Paste it here. We'll split it into lines and leave the words alone."
          onChange={(event) => setPasted(event.target.value)}
        />
      </Dialog>
    </Box>
  );
};

export const IdeaStep = memo(IdeaStepInternal);
IdeaStep.displayName = "ScriptIdeaStep";

export default IdeaStep;
