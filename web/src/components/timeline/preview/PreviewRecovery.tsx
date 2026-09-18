import {
  Component,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode
} from "react";
import { openBugReport } from "../../../stores/BugReportStore";
import type { BugReportContext } from "../../../utils/bugReportBundle";
import ReportBugButton from "../../support/ReportBugButton";
import {
  AlertBanner,
  Box,
  EditorButton,
  FlexRow,
  SPACING,
  Z_INDEX
} from "../../ui_primitives";
import {
  logPreviewFailure,
  previewFailureMessage,
  previewFailureText,
  type PreviewFailureHandler
} from "./previewFailure";

interface PreviewRecoveryProps {
  readonly children: (
    onFailure: PreviewFailureHandler,
    onReady: () => void
  ) => ReactNode;
  readonly onPause: () => void;
  readonly timelineId?: string;
}

const MAX_AUTOMATIC_RETRIES = 2;

// React requires a class boundary for render and lifecycle failures.
class PreviewErrorBoundary extends Component<
  { children: ReactNode; onFailure: PreviewFailureHandler },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.props.onFailure({
      stage: "renderer-react",
      error,
      detail: info.componentStack ?? undefined
    });
  }

  render(): ReactNode {
    return this.state.failed ? null : this.props.children;
  }
}

export function PreviewRecovery({
  children,
  onPause,
  timelineId
}: PreviewRecoveryProps): ReactNode {
  const [generation, setGeneration] = useState(0);
  const [issue, setIssue] = useState<{
    message: string;
    context: BugReportContext;
    terminal: boolean;
  } | null>(null);
  const [waiting, setWaiting] = useState(false);
  const attempts = useRef(0);
  const failed = useRef(false);
  const history = useRef<string[]>([]);
  const seen = useRef(new Set<string>());

  const onFailure: PreviewFailureHandler = useCallback(
    (failure) => {
      const key = `${failure.stage}:${failure.resourceId ?? ""}`;
      if (!seen.current.has(key)) {
        seen.current.add(key);
        logPreviewFailure(failure);
        history.current = [
          ...history.current.slice(-19),
          previewFailureText(failure)
        ];
      }
      if (failed.current) return;
      failed.current = true;
      onPause();
      const terminal = attempts.current >= MAX_AUTOMATIC_RETRIES;
      const context: BugReportContext = {
        source: "panel-crash",
        summary: "Timeline preview failed",
        errorText: history.current.join("\n\n"),
        nodeDetail: JSON.stringify({
          timelineId,
          automaticRetries: attempts.current
        })
      };
      setIssue({
        message: previewFailureMessage(failure.stage),
        context,
        terminal
      });
      setWaiting(!terminal);
      if (terminal) openBugReport(context);
    },
    [onPause, timelineId]
  );

  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => {
      attempts.current += 1;
      failed.current = false;
      seen.current.clear();
      setGeneration((value) => value + 1);
      setWaiting(false);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const onReady = useCallback(() => {
    if (failed.current) return;
    setIssue(null);
  }, []);

  // Allow recovery from a later incident, without resetting the budget during a failure loop.
  useEffect(() => {
    if (issue) return;
    const timer = window.setTimeout(() => {
      attempts.current = 0;
    }, 60_000);
    return () => window.clearTimeout(timer);
  }, [issue]);

  const retry = useCallback(() => {
    attempts.current = 0;
    failed.current = false;
    seen.current.clear();
    setIssue(null);
    setGeneration((value) => value + 1);
  }, []);

  return (
    <>
      {!waiting && !issue?.terminal && (
        <PreviewErrorBoundary key={generation} onFailure={onFailure}>
          {children(onFailure, onReady)}
        </PreviewErrorBoundary>
      )}
      {issue && (
        <Box
          sx={{
            position: "absolute",
            inset: SPACING.xs,
            zIndex: Z_INDEX.modal,
            pointerEvents: "none"
          }}
        >
          <AlertBanner
            severity={issue.terminal ? "error" : "warning"}
            sx={{ pointerEvents: "auto" }}
            action={
              <FlexRow gap={SPACING.xs}>
                {issue.terminal && (
                  <EditorButton onClick={retry}>Retry preview</EditorButton>
                )}
                <ReportBugButton context={issue.context} />
              </FlexRow>
            }
          >
            {issue.message}{" "}
            {issue.terminal
              ? "Automatic recovery failed. Your timeline is unchanged."
              : "Restarting preview…"}
          </AlertBanner>
        </Box>
      )}
    </>
  );
}
