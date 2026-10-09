import { formatUsd } from "@nodetool-ai/model-pricing";
import { isModelSelected } from "@nodetool-ai/protocol";
import {
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  Text,
  Tooltip
} from "../ui_primitives";
import { generationEstimate, type GenerationModel } from "./generationEstimate";

export interface GenerationSummaryProps {
  result: string;
  next: string;
  model: GenerationModel | null;
  brief: string;
  maxOutputTokens: number;
  /** Imported attributed text or a preset plan needs no model call. */
  noModelCall?: boolean;
  /** Keep a secondary action's estimate compact beside its own controls. */
  compact?: boolean;
  /** Use shorter copy for the video flow's inline generation summary. */
  concise?: boolean;
  /** Hide the token assumptions when the estimate adds clutter. */
  hideTokenEstimate?: boolean;
}

export interface GenerationEstimateLineProps extends GenerationSummaryProps {
  /** The model's name is already on a picker beside the line. */
  hideModel?: boolean;
}

/**
 * The run's estimate as one line for the setup footer: model, cost, wait.
 * What the run produces and the token assumptions sit in a tooltip, so the
 * footer holds the numbers and nothing else. The line takes focus and opens on
 * a tap, so the details reach keyboard and touch as well as a mouse.
 */
export function GenerationEstimateLine({
  result,
  model: rawModel,
  brief,
  maxOutputTokens,
  noModelCall,
  hideModel = false
}: GenerationEstimateLineProps) {
  // The "empty" sentinel is no choice, whatever default id it carries.
  const model = isModelSelected(rawModel) ? rawModel : null;
  const estimate = noModelCall
    ? null
    : generationEstimate(model, brief, maxOutputTokens);
  const parts = [
    hideModel || noModelCall
      ? null
      : (model?.name ?? model?.id ?? "No model selected"),
    noModelCall
      ? "No model call"
      : estimate
        ? estimate.high === 0
          ? "$0 (local)"
          : `~${formatUsd(estimate.low)}–${formatUsd(estimate.high)}`
        : "Cost unknown",
    noModelCall ? null : "~30–60s"
  ].filter((part): part is string => part !== null);
  const assumptions =
    estimate && estimate.high > 0
      ? ` About ${estimate.inputTokens.toLocaleString()} input and 1,000–${maxOutputTokens.toLocaleString()} output tokens. Actual usage may cost more.`
      : "";
  return (
    <Tooltip
      title={`${result}.${assumptions}`}
      describeChild
      enterTouchDelay={0}
      leaveTouchDelay={6000}
    >
      <Text
        size="small"
        color="secondary"
        component="span"
        role="group"
        aria-label="Before you generate"
        tabIndex={0}
        sx={{ whiteSpace: "nowrap", cursor: "help" }}
      >
        {parts.join(" · ")}
      </Text>
    </Tooltip>
  );
}

export default function GenerationSummary({
  result,
  next,
  model: rawModel,
  brief,
  maxOutputTokens,
  noModelCall,
  compact = false,
  concise = false,
  hideTokenEstimate = false
}: GenerationSummaryProps) {
  // The "empty" sentinel is no choice, whatever default id it carries.
  const model = isModelSelected(rawModel) ? rawModel : null;
  const estimate = noModelCall
    ? null
    : generationEstimate(model, brief, maxOutputTokens);
  const cost = noModelCall
    ? "$0, no model call"
    : estimate
      ? estimate.high === 0
        ? "$0 provider cost (local model)"
        : `Rough cost: ${formatUsd(estimate.low)}–${formatUsd(estimate.high)}`
      : "Cost estimate unavailable for this model";
  return (
    <FlexColumn
      gap={GAP.tight}
      role="region"
      aria-label={compact ? result : "Before you generate"}
    >
      {!compact ? <Label>{result}</Label> : null}
      <Text size="small" color="secondary">
        {next}
      </Text>
      <FlexRow gap={GAP.spacious} wrap>
        <Text size="small">
          {noModelCall
            ? "Uses the existing text or preset"
            : `Model: ${model?.name ?? model?.id ?? "Not selected"}${model ? ` (${model.provider})` : ""}`}
        </Text>
        <Text size="small">{cost}</Text>
        <Text size="small">
          {noModelCall
            ? "Ready immediately"
            : concise || compact
              ? "Rough wait: 30–60s or longer"
              : "Rough wait: 30–60 seconds; longer for large requests or slower models"}
        </Text>
      </FlexRow>
      {estimate && estimate.high > 0 && !hideTokenEstimate ? (
        <Caption color="secondary">
          {concise
            ? `Estimate: ~${estimate.inputTokens.toLocaleString()} input tokens and 1,000–${maxOutputTokens.toLocaleString()} output tokens. Actual usage may cost more.`
            : `Assumes about ${estimate.inputTokens.toLocaleString()} input tokens and 1,000–${maxOutputTokens.toLocaleString()} output tokens. Actual usage, including reasoning, may cost more.`}
        </Caption>
      ) : null}
    </FlexColumn>
  );
}
