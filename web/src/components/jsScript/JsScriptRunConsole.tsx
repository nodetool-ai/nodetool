/**
 * The run console under the editor: Run (prompting for the declared inputs),
 * Test (running every saved case), and the results — logs, emitted stream,
 * final outputs, and errors — as the run endpoint reports them.
 *
 * Both buttons execute server-side against the *saved* document, so the
 * console says so when a save is still pending rather than letting the user
 * read a stale result as a fresh one.
 */
import { memo, useCallback, useState } from "react";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk/code-body";

import {
  AlertBanner,
  Box,
  Chip,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  ScrollArea,
  Text,
  BORDER_RADIUS,
  SPACING,
  TYPOGRAPHY
} from "../ui_primitives";
import {
  useJsScriptCode,
  useJsScriptLastRun,
  useJsScriptLastTest,
  useJsScriptPorts,
  useJsScriptRunning,
  useJsScriptSaveStatus,
  useJsScriptTests,
  type JsScriptTestCaseReport
} from "../../stores/jsScript/JsScriptStore";
import JsScriptRunDialog, {
  type JsScriptRunRequest
} from "./JsScriptRunDialog";

export interface JsScriptRunConsoleProps {
  scriptId: string;
  readOnly?: boolean;
  onRun: (request: JsScriptRunRequest) => void;
  onTest: () => void;
}

const json = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const Mono = ({ children }: { children: string }) => (
  <Box
    component="pre"
    sx={{
      ...TYPOGRAPHY.mono.code,
      margin: 0,
      padding: SPACING.sm,
      overflowX: "auto",
      borderRadius: BORDER_RADIUS.sm,
      backgroundColor: "var(--palette-action-hover)"
    }}
  >
    {children}
  </Box>
);

const CaseReport = ({ report }: { report: JsScriptTestCaseReport }) => (
  <FlexColumn gap={SPACING.xs}>
    <FlexRow gap={SPACING.sm} align="center">
      <Chip
        compact
        color={report.ok ? "success" : "error"}
        label={report.ok ? "pass" : "fail"}
      />
      <Text size="small" weight={600}>
        {report.name}
      </Text>
    </FlexRow>
    {report.error && (
      <Text size="small" color="error">
        {report.error}
      </Text>
    )}
    {report.mismatches.map((mismatch, index) => (
      <Mono key={index}>
        {`${mismatch.output}\n  expected: ${json(
          mismatch.expected
        )}\n  actual:   ${json(mismatch.actual)}`}
      </Mono>
    ))}
  </FlexColumn>
);

const JsScriptRunConsole = ({
  scriptId,
  readOnly = false,
  onRun,
  onTest
}: JsScriptRunConsoleProps) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const { inputs } = useJsScriptPorts(scriptId);
  const code = useJsScriptCode(scriptId);
  const streaming = usesStreamInputContract(code);
  const tests = useJsScriptTests(scriptId);
  const lastRun = useJsScriptLastRun(scriptId);
  const lastTest = useJsScriptLastTest(scriptId);
  const running = useJsScriptRunning(scriptId);
  const saveStatus = useJsScriptSaveStatus(scriptId);

  const handleRun = useCallback(
    (request: JsScriptRunRequest) => {
      onRun(request);
    },
    [onRun]
  );

  return (
    <FlexColumn fullWidth gap={SPACING.sm} sx={{ minHeight: 0, flex: 1 }}>
      <FlexRow gap={SPACING.sm} align="center" wrap padding={1}>
        <EditorButton
          density="compact"
          variant="contained"
          startIcon={<PlayArrowIcon fontSize="small" />}
          disabled={running || readOnly}
          onClick={() => setDialogOpen(true)}
        >
          Run
        </EditorButton>
        <EditorButton
          density="compact"
          startIcon={<ScienceOutlinedIcon fontSize="small" />}
          disabled={running || readOnly || tests.length === 0}
          onClick={onTest}
        >
          {tests.length === 0 ? "No tests" : `Test (${tests.length})`}
        </EditorButton>
        {running && (
          <Text size="small" color="secondary">
            Running…
          </Text>
        )}
        {saveStatus !== "saved" && (
          <Text size="small" color="secondary">
            Runs use the saved script — this one is {saveStatus}.
          </Text>
        )}
      </FlexRow>

      <ScrollArea>
        <FlexColumn gap={SPACING.md} padding={1}>
          {lastTest && (
            <FlexColumn gap={SPACING.sm}>
              <FlexRow gap={SPACING.sm} align="center">
                <Label>Tests</Label>
                <Chip
                  compact
                  color={lastTest.failed === 0 ? "success" : "error"}
                  label={`${lastTest.passed} passed, ${lastTest.failed} failed`}
                />
              </FlexRow>
              {lastTest.cases.map((report) => (
                <CaseReport key={report.name} report={report} />
              ))}
            </FlexColumn>
          )}

          {lastRun && (
            <FlexColumn gap={SPACING.sm}>
              <FlexRow gap={SPACING.sm} align="center">
                <Label>Last run</Label>
                <Chip
                  compact
                  color={lastRun.ok ? "success" : "error"}
                  label={lastRun.ok ? "ok" : "failed"}
                />
                <Text size="small" color="secondary">
                  {lastRun.duration_ms} ms
                </Text>
              </FlexRow>
              {lastRun.error && (
                <AlertBanner severity="error" compact>
                  {lastRun.error}
                </AlertBanner>
              )}
              {lastRun.logs.length > 0 && (
                <>
                  <Label>Logs</Label>
                  <Mono>{lastRun.logs.join("\n")}</Mono>
                </>
              )}
              {lastRun.streamed && lastRun.streamed.length > 0 && (
                <>
                  <Label>Streamed</Label>
                  <Mono>{json(lastRun.streamed)}</Mono>
                </>
              )}
              {lastRun.outputs && (
                <>
                  <Label>Outputs</Label>
                  <Mono>{json(lastRun.outputs)}</Mono>
                </>
              )}
            </FlexColumn>
          )}

          {!lastRun && !lastTest && (
            <Text size="small" color="secondary">
              Run the script to see its logs, emitted values, and outputs here.
            </Text>
          )}
        </FlexColumn>
      </ScrollArea>

      <JsScriptRunDialog
        open={dialogOpen}
        inputs={inputs}
        streaming={streaming}
        onClose={() => setDialogOpen(false)}
        onRun={handleRun}
      />
    </FlexColumn>
  );
};

export default memo(JsScriptRunConsole);
