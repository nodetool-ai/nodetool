/**
 * Report button for an error banner that shows only prose — the chat dock's,
 * above all. When a provider call failed just before, the report carries that
 * call: provider, model, HTTP status, the provider's request id, how long it
 * ran, and the request that was sent.
 *
 * With no recent provider failure the button still works; the report is then
 * the error text alone, which is what a transport failure has to offer.
 */
import { memo, useMemo } from "react";
import ReportBugButton from "./ReportBugButton";
import {
  latestRecentFailure,
  useProviderCallFailureStore
} from "../../stores/ProviderCallFailureStore";
import {
  formatProviderCallFailure,
  providerCallSummary
} from "../../utils/providerCallReport";
import type { BugReportContext } from "../../utils/bugReportBundle";

interface ProviderFailureReportButtonProps {
  /** The message the surface is showing. */
  errorText: string;
  label?: string;
  className?: string;
}

const ProviderFailureReportButton = ({
  errorText,
  label,
  className
}: ProviderFailureReportButtonProps) => {
  const failures = useProviderCallFailureStore((state) => state.failures);

  const context = useMemo<BugReportContext>(() => {
    const failure = latestRecentFailure(failures);
    if (!failure) {
      return { source: "manual", summary: errorText, errorText };
    }
    return {
      source: "provider-call",
      summary: providerCallSummary(failure),
      errorText,
      provider: failure.provider,
      model: failure.model ?? undefined,
      workflowId: failure.workflow_id ?? undefined,
      jobId: failure.job_id ?? undefined,
      providerCallDetail: formatProviderCallFailure(failure)
    };
  }, [failures, errorText]);

  return (
    <ReportBugButton context={context} label={label} className={className} />
  );
};

export default memo(ProviderFailureReportButton);
