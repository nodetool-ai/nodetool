/**
 * The run console under the editor: Run (prompting for the declared inputs),
 * Test (running every saved case), and the results — logs, emitted stream,
 * final outputs, and errors — as the run endpoint reports them.
 *
 * Both buttons execute server-side against the *saved* document, so the
 * console says so when a save is still pending rather than letting the user
 * read a stale result as a fresh one.
 *
 * Given `documentBar`, the save status, Run and Test move into the workspace
 * document bar and the console keeps the output and the "Running…" state.
 */
import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import ScienceOutlinedIcon from "@mui/icons-material/ScienceOutlined";
import { usesStreamInputContract } from "@nodetool-ai/node-sdk/code-body";

import {
  AlertBanner,
  Chip,
  CodeBlock,
  EditorButton,
  FlexColumn,
  FlexRow,
  Label,
  LogView,
  SaveStatus,
  ScrollArea,
  Text,
  SPACING,
  type DocumentBarRender,
  type SaveStatusValue
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
import { useContextCommands } from "../../hooks/useContextCommands";
import type { ContextCommand } from "../../stores/CommandMenuStore";
import JsScriptRunDialog, {
  type JsScriptRunRequest
} from "./JsScriptRunDialog";

interface JsScriptRunConsoleProps {
  scriptId: string;
  readOnly?: boolean;
  /** Whether the console's tab is on screen; lists Run and Test in the Cmd+K menu. */
  active?: boolean;
  onRun: (request: JsScriptRunRequest) => void;
  onTest: () => void;
  /** Draws the save status, Run and Test in the workspace document bar. */
  documentBar?: DocumentBarRender;
}

const BAR_SAVE_STATUS: Record<string, SaveStatusValue> = {
  unsaved: "dirty",
  saving: "saving",
  error: "error"
};

const json = (value: unknown): string => {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
};

const Mono = ({ children }: { children: string }) => (
  <CodeBlock maxHeight="none" wrap={false}>
    {children}
  </CodeBlock>
);

const CaseReport = ({ report }: { report: JsScriptTestCaseReport }) => {
  const { t } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
  return <FlexColumn gap={SPACING.xs}>
    <FlexRow gap={SPACING.sm} align="center">
      <Chip
        compact
        color={report.ok ? "success" : "error"}
        label={report.ok ? t("status.pass") : t("status.fail")}
      />
      <Text size="small" weight={600}>
        {report.name}
      </Text>
    </FlexRow>
    {report.error && (
      <AlertBanner severity="error" compact>
        {report.error}
      </AlertBanner>
    )}
    {report.mismatches.map((mismatch, index) => (
      <Mono key={index}>
        {`${mismatch.output}\n  expected: ${json(
          mismatch.expected
        )}\n  actual:   ${json(mismatch.actual)}`}
      </Mono>
    ))}
  </FlexColumn>;
};

const JsScriptRunConsole = ({
  scriptId,
  readOnly = false,
  active = false,
  onRun,
  onTest,
  documentBar
}: JsScriptRunConsoleProps) => {
  const { t, i18n } = useTranslation("translation", { keyPrefix: "screen_scripts_js" });
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

  const menuCommands = useMemo<ContextCommand[]>(() => {
    if (running || readOnly) {
      return [];
    }
    const commands: ContextCommand[] = [
      { id: "run", label: t("actions.runScript"), run: () => setDialogOpen(true) }
    ];
    if (tests.length > 0) {
      commands.push({ id: "test", label: t("actions.runTests"), run: onTest });
    }
    return commands;
  }, [running, readOnly, tests.length, onTest, t]);
  useContextCommands(t("context.script"), menuCommands, active);

  const runButton = (
    <EditorButton
      density={documentBar ? "normal" : "compact"}
      variant="contained"
      startIcon={<PlayArrowIcon />}
      disabled={readOnly}
      loading={running}
      onClick={() => setDialogOpen(true)}
    >
      {t("actions.run")}
    </EditorButton>
  );
  const testButton = (
    <EditorButton
      density={documentBar ? "normal" : "compact"}
      startIcon={<ScienceOutlinedIcon />}
      disabled={running || readOnly || tests.length === 0}
      onClick={onTest}
    >
      {tests.length === 0 ? t("tests.none") : t("tests.count", { count: tests.length })}
    </EditorButton>
  );
  const runningLabel = running && (
    <Text size="small" color="secondary">
      {t("status.running")}
    </Text>
  );
  // A reload has no `SaveStatus` counterpart, so the bar shows it as saved
  // and the console keeps the notice.
  const saveNotice = saveStatus !== "saved" &&
    (!documentBar || saveStatus === "reloaded") && (
      <Text size="small" color="secondary">
        {t("status.savedScript", { status: t(`saveStatus.${saveStatus}`) })}
      </Text>
    );

  return (
    <FlexColumn fullWidth gap={SPACING.sm} sx={{ minHeight: 0, flex: 1 }}>
      {documentBar ? (
        <>
          {documentBar(
            readOnly
              ? {}
              : {
                  status: (
                    <SaveStatus state={BAR_SAVE_STATUS[saveStatus] ?? "saved"} />
                  ),
                  actions: (
                    <>
                      {runButton}
                      {testButton}
                    </>
                  )
                }
          )}
          {(runningLabel || saveNotice) && (
            <FlexRow gap={SPACING.sm} align="center" wrap padding={1}>
              {runningLabel}
              {saveNotice}
            </FlexRow>
          )}
        </>
      ) : (
        <FlexRow gap={SPACING.sm} align="center" wrap padding={1}>
          {runButton}
          {testButton}
          {runningLabel}
          {saveNotice}
        </FlexRow>
      )}

      <ScrollArea>
        <FlexColumn gap={SPACING.md} padding={1}>
          {(readOnly && tests.length > 0) || lastTest ? (
            <FlexRow gap={SPACING.lg} align="flex-start">
              {readOnly && tests.length > 0 && (
                <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minWidth: 0 }}>
                  <Label>{t("tests.savedCases")}</Label>
                  {tests.map((test) => (
                    <FlexColumn key={test.name} gap={SPACING.xs}>
                      <Text size="small" weight={600}>
                        {test.name}
                      </Text>
                      <Mono>{`inputs: ${JSON.stringify(test.inputs)}\nexpected: ${JSON.stringify(test.expect)}`}</Mono>
                    </FlexColumn>
                  ))}
                </FlexColumn>
              )}
              {lastTest && (
                <FlexColumn gap={SPACING.sm} sx={{ flex: 1, minWidth: 0 }}>
                  <FlexRow gap={SPACING.sm} align="center">
                    <Label>{t("tests.title")}</Label>
                    <Chip
                      compact
                      color={lastTest.failed === 0 ? "success" : "error"}
                      label={t("tests.result", { passed: new Intl.NumberFormat(i18n.language).format(lastTest.passed), failed: new Intl.NumberFormat(i18n.language).format(lastTest.failed) })}
                    />
                  </FlexRow>
                  {lastTest.cases.map((report) => (
                    <CaseReport key={report.name} report={report} />
                  ))}
                </FlexColumn>
              )}
            </FlexRow>
          ) : null}

          {lastRun && (
            <FlexColumn gap={SPACING.sm}>
              <FlexRow gap={SPACING.sm} align="center">
                <Label>{t("run.lastRun")}</Label>
                <Chip
                  compact
                  color={lastRun.ok ? "success" : "error"}
                  label={lastRun.ok ? t("status.ok") : t("status.failed")}
                />
                <Text size="small" color="secondary">
                  {new Intl.NumberFormat(i18n.language).format(lastRun.duration_ms)} {t("units.milliseconds")}
                </Text>
              </FlexRow>
              {lastRun.error && (
                <AlertBanner severity="error" compact>
                  {lastRun.error}
                </AlertBanner>
              )}
              {lastRun.logs.length > 0 && (
                <>
                  <Label>{t("run.logs")}</Label>
                  <LogView lines={lastRun.logs} />
                </>
              )}
              {lastRun.streamed && lastRun.streamed.length > 0 && (
                <>
                  <Label>{t("run.streamed")}</Label>
                  <Mono>{json(lastRun.streamed)}</Mono>
                </>
              )}
              {lastRun.outputs && (
                <>
                  <Label>{t("run.outputs")}</Label>
                  <Mono>{json(lastRun.outputs)}</Mono>
                </>
              )}
            </FlexColumn>
          )}

          {!lastRun && !lastTest && (
            <Text size="small" color="secondary">
              {t("run.empty")}
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
