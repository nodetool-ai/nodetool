/**
 * Step 1 of the script flow — the idea (PRD § 9.1).
 *
 * A topic in a box that writes straight to the document, so `Continue` has
 * only the stage left to write and a reload resumes with the text intact
 * (D1, D3).
 *
 * The three other ways in sit beside it. Pasted and uploaded words go into the
 * import registry as well as the brief: the writer step then splits and
 * attributes them instead of rewriting them, which is what makes an imported
 * script come out in the creator's own words (§ 9.2, criterion 4).
 */

import React, { memo, useCallback, useMemo, useRef, useState } from "react";

import {
  AlertBanner,
  Box,
  Caption,
  Chip,
  Dialog,
  FlexColumn,
  GAP,
  Text,
  TextInput
} from "../../ui_primitives";
import { useScriptStore, useScriptSetup } from "../../../stores/script/ScriptStore";
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

const IdeaStepInternal: React.FC<IdeaStepProps> = ({
  scriptId,
  onStartBlank
}) => {
  const setup = useScriptSetup(scriptId);
  const setSetup = useScriptStore((state) => state.setSetup);
  const imports = useScriptFileImport(scriptId);
  const textInput = useRef<HTMLInputElement>(null);
  const subtitleInput = useRef<HTMLInputElement>(null);
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState("");

  const brief = setup?.brief ?? "";

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

  const alternatives: AlternativeEntry[] = useMemo(
    () => [
      {
        id: "paste",
        title: "Paste your script",
        description: "Words you already have, kept exactly as you wrote them",
        onSelect: () => setPasting(true)
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
    [imports.importing, onStartBlank]
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

        <TextInput
          value={brief}
          autoFocus
          multiline
          rows={5}
          label="Your script"
          hideLabel
          placeholder="One sentence is enough, or paste what you already have."
          onChange={handleChange}
        />

        {imports.error ? (
          <AlertBanner severity="error" onClose={imports.clearError}>
            {imports.error}
          </AlertBanner>
        ) : null}

        <FlexColumn gap={GAP.normal}>
          <Caption color="secondary" component="p">
            Or start from one of these:
          </Caption>
          <Box
            role="group"
            aria-label="Inspiration"
            sx={{ display: "flex", flexWrap: "wrap", gap: GAP.normal }}
          >
            {INSPIRATIONS.map((idea) => (
              <Chip
                key={idea}
                label={idea}
                onClick={() => setSetup(scriptId, { brief: idea })}
              />
            ))}
          </Box>
        </FlexColumn>
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
        title="Paste your script"
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
