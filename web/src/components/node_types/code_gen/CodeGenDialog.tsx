/**
 * CodeGenDialog — describe a result, get a working typed Code Node.
 *
 * One dialog covers the whole flow: an instruction field, the typed inputs
 * already on the node (or seeded from the handle the user launched from), the
 * expected output when it is known, the model that will write the code, and —
 * once a submission comes back — its title, summary, handles, and code, behind
 * an Apply that writes everything onto the node in a single undoable step.
 *
 * Nothing is persisted before Apply: cancelling or failing leaves the node
 * untouched. Monaco is loaded only when the user opens the code view.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";
import { MAX_INSTRUCTION_LENGTH } from "@nodetool-ai/protocol/api-schemas/code-gen.js";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Chip,
  CollapsibleSection,
  Dialog,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  TextInput,
  TextLink,
  TYPOGRAPHY
} from "../../ui_primitives";
import CodeAuthoringModelNotice from "../../model_menu/CodeAuthoringModelNotice";
import { useNodes } from "../../../contexts/NodeContext";
import { useMonacoEditor } from "../../../hooks/editor/useMonacoEditor";
import {
  CODE_AUTHORING_SOURCE_LABEL,
  useCodeAuthoringModel
} from "../../../hooks/useCodeAuthoringModel";
import {
  useGenerateCode,
  type CodeGenFailure
} from "../../../serverState/codeGen";
import CodeGenPreviewPanel from "./CodeGenPreviewPanel";
import CodeGenSamplesSection from "./CodeGenSamplesSection";
import { sampleValuesOf, serializeSampleValues } from "./codeGenSamples";
import { useCodeGenSamples } from "./useCodeGenSamples";

/** Settings tab holding the Default Models section. */
const DEFAULT_MODELS_SETTINGS_PATH = "/settings?tab=0";

export interface CodeGenDialogProps {
  open: boolean;
  /** The Code Node the accepted submission is applied to. */
  nodeId: string;
  onClose: () => void;
  /** Typed inputs already on the node, or seeded from a source handle. */
  inputs?: readonly codeGen.CodeGenInputPort[];
  /** Set when launched from a destination handle (task 7). */
  expectedOutput?: codeGen.CodeGenExpectedOutput;
}

interface FailureCopy {
  title: string;
  detail: string;
  issues?: readonly string[];
}

/** Every failure variant gets its own wording — including the client-only two. */
export function describeFailure(failure: CodeGenFailure): FailureCopy {
  switch (failure.code) {
    case "provider_unavailable":
      return {
        title: failure.provider
          ? `${failure.provider} is not available`
          : "Model provider is not available",
        detail:
          "Add or check the provider's API key under Settings, then try again."
      };
    case "aborted":
      return {
        title: "Generation cancelled",
        detail: "Nothing was written to the node."
      };
    case "no_valid_submission":
      return {
        title: "The model could not produce valid code",
        detail:
          "Rephrase the instruction — naming the inputs and the exact result usually fixes it.",
        issues: failure.issues
      };
    case "rate_limited":
      return {
        title: "Too many generations at once",
        detail:
          typeof failure.retryAfterMs === "number"
            ? `Wait about ${Math.ceil(failure.retryAfterMs / 1000)}s and try again.`
            : "Wait for the running generation to finish and try again."
      };
    case "unauthorized":
      return {
        title: "Sign in to generate code",
        detail: "Your session expired. Sign in again to keep generating."
      };
    case "offline":
      return {
        title: "You are offline",
        detail: "Code generation needs a connection to the NodeTool server."
      };
    case "internal":
    default:
      return {
        title: "Generation failed",
        detail: failure.message || "Try again in a moment."
      };
  }
}

const typeLabel = (type: codeGen.CodeGenTypeMetadata): string => type.type;

const PortList = ({
  label,
  ports
}: {
  label: string;
  ports: readonly { name: string; type: codeGen.CodeGenTypeMetadata }[];
}) => (
  <FlexColumn gap={SPACING.xs}>
    <Label>{label}</Label>
    <FlexRow gap={SPACING.xs} sx={{ flexWrap: "wrap" }}>
      {ports.map((port) => (
        <Chip
          key={port.name}
          compact
          label={`${port.name}: ${typeLabel(port.type)}`}
        />
      ))}
    </FlexRow>
  </FlexColumn>
);

const CodeGenDialogInner = ({
  open,
  nodeId,
  onClose,
  inputs,
  expectedOutput
}: CodeGenDialogProps) => {
  const navigate = useNavigate();
  const applyCodeGenSubmission = useNodes(
    (state) => state.applyCodeGenSubmission
  );

  const {
    model,
    source,
    skipped,
    isLoading: isModelLoading,
    isBlocked
  } = useCodeAuthoringModel();
  const { generate, cancel, reset, result, isPending } = useGenerateCode();

  const [instruction, setInstruction] = useState("");
  const [isCodeOpen, setIsCodeOpen] = useState(false);
  const { MonacoEditor, monacoLoadError, isMonacoLoading, loadMonacoIfNeeded } =
    useMonacoEditor();

  // Samples stay local unless the user opts in, and the exact payload is shown
  // and acknowledged before the first request that carries it.
  const [sampleEpoch, setSampleEpoch] = useState(0);
  const [includeSamples, setIncludeSamples] = useState(false);
  const [payloadAcknowledged, setPayloadAcknowledged] = useState(false);
  const [hasSentSamples, setHasSentSamples] = useState(false);
  const samples = useCodeGenSamples(nodeId, sampleEpoch);
  const { reset: resetSamples } = samples;

  // Every open starts from a blank slate — a submission from a previous open
  // would otherwise be applicable to a node the user has since edited. Guarded
  // on the closed→open transition so a re-render never wipes what is typed.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (open && !wasOpen.current) {
      setInstruction("");
      setIsCodeOpen(false);
      setIncludeSamples(false);
      setPayloadAcknowledged(false);
      setHasSentSamples(false);
      setSampleEpoch((epoch) => epoch + 1);
      resetSamples();
      reset();
    }
    wasOpen.current = open;
  }, [open, reset, resetSamples]);

  const submission = result?.status === "ok" ? result.submission : null;
  const failure = result?.status === "error" ? result.error : null;

  const requestPorts = useMemo(() => inputs ?? [], [inputs]);
  const requestEntries = samples.entriesFor(requestPorts);
  const previewEntries = samples.entriesFor(submission?.inputs ?? []);

  const payload = useMemo(
    () => serializeSampleValues(sampleValuesOf(requestEntries)),
    [requestEntries]
  );

  const needsAcknowledgement =
    includeSamples && !hasSentSamples && !payloadAcknowledged;
  const samplesBlockGeneration =
    includeSamples && (payload.exceedsLimit || needsAcknowledgement);

  const handleGenerate = useCallback(() => {
    if (!model || samplesBlockGeneration) {
      return;
    }
    const sampleValues = includeSamples
      ? sampleValuesOf(requestEntries)
      : undefined;
    generate({
      instruction: instruction.trim(),
      inputs: inputs ? [...inputs] : [],
      ...(expectedOutput ? { expectedOutput } : {}),
      ...(sampleValues ? { sampleValues } : {}),
      provider: model.provider,
      model: model.id
    });
    if (sampleValues) {
      setHasSentSamples(true);
    }
  }, [
    generate,
    instruction,
    inputs,
    expectedOutput,
    model,
    includeSamples,
    requestEntries,
    samplesBlockGeneration
  ]);

  const handleApply = useCallback(() => {
    if (!submission) {
      return;
    }
    applyCodeGenSubmission(nodeId, submission);
    onClose();
  }, [applyCodeGenSubmission, nodeId, submission, onClose]);

  const handleClose = useCallback(() => {
    cancel();
    onClose();
  }, [cancel, onClose]);

  const handleToggleCode = useCallback(
    (next: boolean) => {
      setIsCodeOpen(next);
      if (next) {
        void loadMonacoIfNeeded();
      }
    },
    [loadMonacoIfNeeded]
  );

  const status = useMemo(() => {
    if (isPending) return "Generating code…";
    if (submission) return `Generated: ${submission.title}`;
    if (failure) return describeFailure(failure).title;
    return "";
  }, [isPending, submission, failure]);

  const canGenerate =
    !!model &&
    instruction.trim().length > 0 &&
    !isPending &&
    !samplesBlockGeneration;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Write code with AI"
      minWidth="min(640px, 100vw - 32px)"
      actions={
        <FlexRow gap={SPACING.md}>
          <EditorButton onClick={handleClose}>Cancel</EditorButton>
          <EditorButton
            variant="contained"
            onClick={handleApply}
            disabled={!submission}
          >
            Apply
          </EditorButton>
        </FlexRow>
      }
    >
      <FlexColumn gap={SPACING.lg}>
        {isBlocked && <CodeAuthoringModelNotice skipped={skipped} />}

        <TextInput
          label="What should this node do?"
          placeholder="Merge the two lists on id and return one row per match."
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
          multiline
          rows={3}
          disabled={isPending || isBlocked}
          slotProps={{ htmlInput: { maxLength: MAX_INSTRUCTION_LENGTH } }}
        />

        {inputs && inputs.length > 0 && (
          <PortList label="Detected inputs" ports={inputs} />
        )}
        {expectedOutput && (
          <PortList label="Expected output" ports={[expectedOutput]} />
        )}

        <CodeGenSamplesSection
          entries={requestEntries}
          onChange={samples.setValue}
          onRevert={samples.clearValue}
          include={includeSamples}
          onIncludeChange={setIncludeSamples}
          payload={payload}
          needsAcknowledgement={needsAcknowledgement}
          onAcknowledge={() => setPayloadAcknowledged(true)}
          disabled={isPending || isBlocked}
        />

        <FlexRow gap={SPACING.md} align="center">
          <Label>Model</Label>
          <Text size="small" color="secondary">
            {isModelLoading
              ? "Resolving…"
              : model
                ? `${model.name}${source ? ` — ${CODE_AUTHORING_SOURCE_LABEL[source]}` : ""}`
                : "None available"}
          </Text>
          <TextLink
            asButton
            onClick={() => navigate(DEFAULT_MODELS_SETTINGS_PATH)}
          >
            Change
          </TextLink>
        </FlexRow>

        <FlexRow gap={SPACING.md} align="center">
          <EditorButton
            variant="contained"
            startIcon={<AutoAwesomeIcon />}
            onClick={handleGenerate}
            disabled={!canGenerate}
          >
            Generate
          </EditorButton>
          {isPending && (
            <>
              <LoadingSpinner size={16} />
              <EditorButton onClick={cancel}>Stop</EditorButton>
            </>
          )}
        </FlexRow>

        <Box
          role="status"
          aria-live="polite"
          aria-label="Generation status"
          sx={{ minHeight: 0 }}
        >
          {status && (
            <Text size="small" color="secondary">
              {status}
            </Text>
          )}
        </Box>

        {failure && (
          <AlertBanner
            severity={failure.code === "aborted" ? "info" : "error"}
            title={describeFailure(failure).title}
          >
            <FlexColumn gap={SPACING.xs}>
              <Text size="small">{describeFailure(failure).detail}</Text>
              {describeFailure(failure).issues?.map((issue) => (
                <Text key={issue} size="smaller" color="secondary">
                  {issue}
                </Text>
              ))}
            </FlexColumn>
          </AlertBanner>
        )}

        {submission && (
          <FlexColumn gap={SPACING.md}>
            <Text weight={600}>{submission.title}</Text>
            <Text size="small" color="secondary">
              {submission.summary}
            </Text>
            {submission.inputs.length > 0 && (
              <PortList label="Inputs" ports={submission.inputs} />
            )}
            <PortList label="Outputs" ports={submission.outputs} />

            <CollapsibleSection
              title={<Label>Show generated code</Label>}
              open={isCodeOpen}
              onToggle={handleToggleCode}
              unmountOnExit
              compact
            >
              <Box
                sx={{
                  height: 240,
                  border: "1px solid var(--palette-grey-500)",
                  borderRadius: BORDER_RADIUS.sm,
                  overflow: "hidden"
                }}
              >
                {MonacoEditor ? (
                  <MonacoEditor
                    value={submission.code}
                    language="javascript"
                    theme="vs-dark"
                    width="100%"
                    height="100%"
                    options={{ readOnly: true, minimap: { enabled: false } }}
                  />
                ) : monacoLoadError ? (
                  <Text size="small" color="error">
                    {monacoLoadError}
                  </Text>
                ) : isMonacoLoading ? (
                  <LoadingSpinner />
                ) : (
                  <Box
                    component="pre"
                    sx={{
                      ...TYPOGRAPHY.mono.code,
                      margin: 0,
                      padding: SPACING.md,
                      overflow: "auto",
                      height: "100%"
                    }}
                  >
                    {submission.code}
                  </Box>
                )}
              </Box>
            </CollapsibleSection>

            <CodeGenPreviewPanel
              submission={submission}
              entries={previewEntries}
              onSampleChange={samples.setValue}
              onSampleRevert={samples.clearValue}
            />
          </FlexColumn>
        )}
      </FlexColumn>
    </Dialog>
  );
};

export const CodeGenDialog = memo(CodeGenDialogInner);
CodeGenDialog.displayName = "CodeGenDialog";

export default CodeGenDialog;
