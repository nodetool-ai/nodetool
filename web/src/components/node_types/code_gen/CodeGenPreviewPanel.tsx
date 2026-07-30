/**
 * Preview panel — run the generated node before applying it.
 *
 * The run goes through `runInlineGraphJob` on a throwaway one-node graph, so
 * the code executes exactly as it will once applied, locally, with the sample
 * values. Results are kept under the run's job id: a slow earlier run that
 * finishes after a newer one is discarded rather than shown.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { codeGen } from "@nodetool-ai/protocol/api-schemas";

import {
  AlertBanner,
  BORDER_RADIUS,
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LoadingSpinner,
  SPACING,
  Text,
  TYPOGRAPHY
} from "../../ui_primitives";
import { globalWebSocketManager } from "../../../lib/websocket/GlobalWebSocketManager";
import { runInlineGraphJob } from "../../../lib/workflow/runInlineGraphJob";
import {
  buildPreviewGraph,
  nextPreviewJobId,
  outputTypeWarnings,
  readPreviewOutputs
} from "./codeGenPreviewRun";
import SampleValueEditor from "./SampleValueEditor";
import { sampleValuesOf, type SampleEntry } from "./codeGenSamples";

export interface CodeGenPreviewPanelProps {
  submission: codeGen.CodeGenSubmission;
  /** Sample entries for the submission's own inputs. */
  entries: readonly SampleEntry[];
  onSampleChange: (name: string, value: unknown) => void;
  onSampleRevert: (name: string) => void;
}

interface PreviewRun {
  jobId: string;
  running: boolean;
  success: boolean;
  outputs: Record<string, unknown>;
  logs: readonly string[];
  warnings: readonly string[];
  durationMs: number;
  error?: string;
}

const formatOutput = (value: unknown): string => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const CodeGenPreviewPanelInner = ({
  submission,
  entries,
  onSampleChange,
  onSampleRevert
}: CodeGenPreviewPanelProps) => {
  const [run, setRun] = useState<PreviewRun | null>(null);
  const activeJobId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      activeJobId.current = null;
    },
    []
  );

  const runPreview = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    const jobId = nextPreviewJobId();
    activeJobId.current = jobId;

    const logs: string[] = [];
    const unsubscribe = globalWebSocketManager.subscribe(jobId, (message) => {
      if (message.type === "log_update" && typeof message.content === "string") {
        logs.push(message.content);
      }
    });

    setRun({
      jobId,
      running: true,
      success: false,
      outputs: {},
      logs: [],
      warnings: [],
      durationMs: 0
    });

    const startedAt = Date.now();
    try {
      const result = await runInlineGraphJob({
        graph: buildPreviewGraph(submission, sampleValuesOf(entries)),
        workflowId: jobId,
        jobName: `Preview: ${submission.title}`,
        signal: controller.signal
      });

      // A run the user superseded must not overwrite the newer one's results.
      if (activeJobId.current !== jobId) {
        return;
      }

      const outputs = readPreviewOutputs(result.outputs);
      setRun({
        jobId,
        running: false,
        success: result.success,
        outputs,
        logs: [...logs],
        warnings: result.success
          ? outputTypeWarnings(submission.outputs, outputs)
          : [],
        durationMs: Date.now() - startedAt,
        ...(result.error ? { error: result.error } : {})
      });
    } catch (error) {
      if (activeJobId.current !== jobId) {
        return;
      }
      setRun({
        jobId,
        running: false,
        success: false,
        outputs: {},
        logs: [...logs],
        warnings: [],
        durationMs: Date.now() - startedAt,
        error: error instanceof Error ? error.message : "Preview failed"
      });
    } finally {
      unsubscribe();
    }
  }, [submission, entries]);

  const handleRun = useCallback(() => {
    void runPreview();
  }, [runPreview]);

  const handleStop = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const status = useMemo(() => {
    if (!run) return "";
    if (run.running) return "Running preview…";
    if (run.error) return `Preview failed: ${run.error}`;
    const base = `Preview finished in ${run.durationMs} ms`;
    return run.warnings.length > 0
      ? `${base} with ${run.warnings.length} type warning${run.warnings.length > 1 ? "s" : ""}`
      : base;
  }, [run]);

  const outputNames = submission.outputs.map((port) => port.name);

  return (
    <FlexColumn gap={SPACING.md}>
      <Label>Preview</Label>

      {entries.length > 0 && (
        <FlexColumn gap={SPACING.md}>
          {entries.map((entry) => (
            <SampleValueEditor
              key={entry.name}
              entry={entry}
              onChange={onSampleChange}
              onRevert={onSampleRevert}
              canRevert={entry.source === "manual"}
            />
          ))}
        </FlexColumn>
      )}

      {/* Re-running while a run is in flight supersedes it: the older run is
          aborted and its result discarded, so the panel always shows the
          newest run. */}
      <FlexRow gap={SPACING.md} align="center">
        <EditorButton onClick={handleRun}>Run preview</EditorButton>
        {run?.running && (
          <>
            <LoadingSpinner size={16} />
            <EditorButton onClick={handleStop}>Stop</EditorButton>
          </>
        )}
      </FlexRow>

      <Box role="status" aria-live="polite" aria-label="Preview status">
        {status && (
          <Text size="small" color="secondary">
            {status}
          </Text>
        )}
      </Box>

      {run && !run.running && run.error && (
        <AlertBanner severity="error" title="Preview failed">
          <Text size="small">{run.error}</Text>
        </AlertBanner>
      )}

      {run && !run.running && run.warnings.length > 0 && (
        <AlertBanner severity="warning" title="Output does not match its type">
          <FlexColumn gap={SPACING.xs}>
            {run.warnings.map((warning) => (
              <Text key={warning} size="small">
                {warning}
              </Text>
            ))}
          </FlexColumn>
        </AlertBanner>
      )}

      {run && !run.running && !run.error && (
        <FlexColumn gap={SPACING.xs}>
          {outputNames.map((name) => (
            <FlexColumn key={name} gap={SPACING.micro}>
              <FlexRow gap={SPACING.xs} align="center">
                <Label>{name}</Label>
                {!Object.prototype.hasOwnProperty.call(run.outputs, name) && (
                  <Chip compact label="not produced" />
                )}
              </FlexRow>
              <Box
                component="pre"
                sx={{
                  ...TYPOGRAPHY.mono.code,
                  margin: 0,
                  padding: SPACING.sm,
                  maxHeight: 160,
                  overflow: "auto",
                  borderRadius: BORDER_RADIUS.sm,
                  border: "1px solid var(--palette-grey-500)"
                }}
              >
                {formatOutput(run.outputs[name])}
              </Box>
            </FlexColumn>
          ))}
        </FlexColumn>
      )}

      {run && !run.running && run.logs.length > 0 && (
        <FlexColumn gap={SPACING.xs}>
          <Label>Logs</Label>
          <Box
            component="pre"
            aria-label="Preview logs"
            sx={{
              ...TYPOGRAPHY.mono.code,
              margin: 0,
              padding: SPACING.sm,
              maxHeight: 160,
              overflow: "auto",
              borderRadius: BORDER_RADIUS.sm,
              border: "1px solid var(--palette-grey-500)"
            }}
          >
            {run.logs.join("\n")}
          </Box>
        </FlexColumn>
      )}
    </FlexColumn>
  );
};

export const CodeGenPreviewPanel = memo(CodeGenPreviewPanelInner);
CodeGenPreviewPanel.displayName = "CodeGenPreviewPanel";

export default CodeGenPreviewPanel;
