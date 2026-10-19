import { formatUsd } from "@nodetool-ai/model-pricing";
import { isModelSelected } from "@nodetool-ai/protocol";
import { useTranslation } from "react-i18next";
import {
  Caption,
  FlexColumn,
  FlexRow,
  GAP,
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
  /** Input the brief does not show, such as attached images. */
  extraInputTokens?: number;
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
  extraInputTokens,
  noModelCall,
  hideModel = false
}: GenerationEstimateLineProps) {
  const { t, i18n } = useTranslation();
  const formatCount = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  // The "empty" sentinel is no choice, whatever default id it carries.
  const model = isModelSelected(rawModel) ? rawModel : null;
  const estimate = noModelCall
    ? null
    : generationEstimate(model, brief, maxOutputTokens, extraInputTokens);
  const parts = [
    hideModel || noModelCall
      ? null
      : (model?.name ?? model?.id ?? t("pass3_2.setup.generation.noModelSelected")),
    noModelCall
      ? t("pass3_2.setup.generation.noModelCall")
      : estimate
        ? estimate.high === 0
          ? t("pass3_2.setup.generation.localCostShort")
          : `~${formatUsd(estimate.low)}–${formatUsd(estimate.high)}`
        : t("pass3_2.setup.generation.costUnknown"),
    noModelCall ? null : t("pass3_2.setup.generation.estimatedWaitShort")
  ].filter((part): part is string => part !== null);
  const assumptions =
    estimate && estimate.high > 0
      ? ` ${t("pass3_2.setup.generation.tooltipAssumptions", {
          inputTokens: formatCount(estimate.inputTokens),
          maxOutputTokens: formatCount(maxOutputTokens)
        })}`
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
        aria-label={t("pass3_2.setup.generation.beforeYouGenerate")}
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
  extraInputTokens,
  noModelCall,
  compact = false,
  concise = false,
  hideTokenEstimate = false
}: GenerationSummaryProps) {
  const { t, i18n } = useTranslation();
  const formatCount = (value: number) =>
    new Intl.NumberFormat(i18n.language).format(value);
  // The "empty" sentinel is no choice, whatever default id it carries.
  const model = isModelSelected(rawModel) ? rawModel : null;
  const estimate = noModelCall
    ? null
    : generationEstimate(model, brief, maxOutputTokens, extraInputTokens);
  const cost = noModelCall
    ? t("pass3_2.setup.generation.noModelCallCost")
    : estimate
      ? estimate.high === 0
        ? t("pass3_2.setup.generation.localModelCost")
        : t("pass3_2.setup.generation.roughCost", {
            low: formatUsd(estimate.low),
            high: formatUsd(estimate.high)
          })
      : t("pass3_2.setup.generation.costEstimateUnavailable");
  return (
    <FlexColumn
      gap={GAP.tight}
      role="region"
      aria-label={
        compact ? result : t("pass3_2.setup.generation.beforeYouGenerate")
      }
    >
      {!compact ? (
        <Text size="normal" weight={500}>
          {result}
        </Text>
      ) : null}
      <Text size="small" color="secondary">
        {next}
      </Text>
      <FlexRow gap={GAP.spacious} wrap>
        <Text size="small">
          {noModelCall
            ? t("pass3_2.setup.generation.usesExistingTextOrPreset")
            : t("pass3_2.setup.generation.model", {
                name:
                  model?.name ??
                  model?.id ??
                  t("pass3_2.setup.generation.notSelected"),
                provider: model?.provider ? ` (${model.provider})` : ""
              })}
        </Text>
        <Text size="small">{cost}</Text>
        <Text size="small">
          {noModelCall
            ? t("pass3_2.setup.generation.readyImmediately")
            : concise || compact
              ? t("pass3_2.setup.generation.roughWaitShort")
              : t("pass3_2.setup.generation.roughWaitLong")}
        </Text>
      </FlexRow>
      {estimate && estimate.high > 0 && !hideTokenEstimate ? (
        <Caption color="secondary">
          {concise
            ? t("pass3_2.setup.generation.tokenEstimate", {
                inputTokens: formatCount(estimate.inputTokens),
                maxOutputTokens: formatCount(maxOutputTokens)
              })
            : t("pass3_2.setup.generation.tokenAssumptions", {
                inputTokens: formatCount(estimate.inputTokens),
                maxOutputTokens: formatCount(maxOutputTokens)
              })}
        </Caption>
      ) : null}
    </FlexColumn>
  );
}
