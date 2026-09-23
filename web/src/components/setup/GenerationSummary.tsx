import React from "react";
import type { ReactNode } from "react";
import { formatUsd } from "@nodetool-ai/model-pricing";
import {
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
  Label,
  Text
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
  /** A model control to show beside the estimate. */
  modelPicker?: ReactNode;
}

export default function GenerationSummary({
  result,
  next,
  model,
  brief,
  maxOutputTokens,
  noModelCall,
  compact = false,
  concise = false,
  hideTokenEstimate = false,
  modelPicker
}: GenerationSummaryProps) {
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
        {modelPicker ?? (
          <Text size="small">
            {noModelCall
              ? "Uses the existing text or preset"
              : `Model: ${model?.name ?? model?.id ?? "Not selected"}${model ? ` (${model.provider})` : ""}`}
          </Text>
        )}
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
