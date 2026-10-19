import React from "react";
import { useTranslation } from "react-i18next";
import { Text, EditorButton, FlexColumn, SPACING } from "../ui_primitives";
import ReportBugButton from "../support/ReportBugButton";
import { reportClientError, type ClientErrorRunContext } from "../../utils/errorTraceReporting";
import { useRunInspection } from "../../hooks/useRunInspection";

interface PanelErrorBoundaryProps {
  fallback?: React.ReactNode;
  /** Names the panel in the report, so a maintainer knows what crashed. */
  panelName?: string;
  children: React.ReactNode;
  onError?: (error: Error) => ClientErrorRunContext | undefined;
  /** Changes only when the data that caused the failure has a new producer. */
  resetKey?: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  run?: ClientErrorRunContext;
  resetKey?: string;
}

interface PanelFailureProps {
  panel: string;
  error?: Error;
  run?: ClientErrorRunContext;
}

function PanelFailure({ panel, error, run }: PanelFailureProps): React.ReactElement {
  const { t } = useTranslation();
  const { openRunInspection } = useRunInspection();
  const panelLabel = panel || t("batch2_10.panelError.panel");
  return <FlexColumn align="center" justify="center" gap={SPACING.sm}
    sx={{ padding: SPACING.lg, minHeight: 200, bgcolor: "error.dark", color: "error.contrastText" }}>
    <Text size="small" component="div">{t("batch2_10.panelError.failedToRender", { panel: panelLabel })}</Text>
    {run ? <EditorButton onClick={() => openRunInspection({ runId: run.app_run_id, spanId: run.span_id })}>{t("batch2_10.panelError.viewTrace")}</EditorButton> : null}
    <ReportBugButton variant="outlined" label={t("batch2_10.panelError.reportBug")} context={{ source: "panel-crash",
      summary: t("batch2_10.panelError.failedToRender", { panel: panelLabel }), errorText: error?.message, stackTrace: error?.stack }} />
  </FlexColumn>;
}

// React error boundaries must be class components: getDerivedStateFromError and
// componentDidCatch have no functional-component equivalent.
export default class PanelErrorBoundary extends React.Component<
  PanelErrorBoundaryProps,
  PanelErrorBoundaryState
> {
  constructor(props: PanelErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(error: Error): Partial<PanelErrorBoundaryState> {
    return { hasError: true, error };
  }

  static getDerivedStateFromProps(props: PanelErrorBoundaryProps, state: PanelErrorBoundaryState): Partial<PanelErrorBoundaryState> | null {
    return props.resetKey !== state.resetKey
      ? { hasError: false, error: undefined, run: undefined, resetKey: props.resetKey }
      : null;
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Panel crashed:", error, errorInfo);
    let run: ClientErrorRunContext | undefined;
    try { run = this.props.onError?.(error); } catch { /* Reporting must not prevent the fallback from rendering. */ }
    if (run) { this.setState({ run }); }
    reportClientError(error, this.props.panelName ?? "panel", run);
  }

  render() {
    if (this.state.hasError) {
      const panel = this.props.panelName ?? "";
      return (
        this.props.fallback ?? (
          <PanelFailure panel={panel} error={this.state.error} run={this.state.run} />
        )
      );
    }
    return this.props.children;
  }
}
