/**
 * What the workflow needs before Run, shown beside the Run button: the API
 * keys its nodes require that are not set, or else what a run is estimated to
 * cost. A missing key reads as a button that opens the provider settings, so
 * the user adds it before the run, not after a failed job.
 */
import { memo, useCallback } from "react";
import { useTranslation } from "react-i18next";
import KeyIcon from "@mui/icons-material/Key";
import { formatUsd } from "@nodetool-ai/model-pricing";
import type { WorkflowCostEstimateDetail } from "@nodetool-ai/node-sdk/cost-estimate";
import { useWorkflowRunReadiness } from "../../hooks/useWorkflowRunReadiness";
import { openSettingsTab } from "../workspace/openPageTab";
import { Caption, EditorButton, Tooltip } from "../ui_primitives";
import { getSecretDisplayName } from "../../utils/nodeProvider";

interface RunReadinessHintProps {
  workflowId: string | undefined;
  /** Phones show only the missing-key button; the estimate has no room. */
  compact?: boolean;
}

type Translate = (key: string, options?: Record<string, unknown>) => string;

function costTooltip(estimate: WorkflowCostEstimateDetail, t: Translate): string {
  if (estimate.unknown_count === 0) {
    return t("pass3_17.templates.estimatedCost", { cost: formatUsd(estimate.total) });
  }
  const unknownNodes = t("pass3_17.templates.unknownPrices", {
    count: estimate.unknown_count
  });
  return estimate.total > 0
    ? t("pass3_17.templates.estimatedCostAtLeast", {
        cost: formatUsd(estimate.total),
        unknownNodes
      })
    : t("pass3_17.templates.estimatedCostUnknown", { unknownNodes });
}

const RunReadinessHint = ({ workflowId, compact = false }: RunReadinessHintProps) => {
  const { t } = useTranslation();
  const { missingSettings, costEstimate } = useWorkflowRunReadiness(workflowId);
  const handleAddKey = useCallback(() => openSettingsTab("providers"), []);

  if (missingSettings.length > 0) {
    const keys = missingSettings.map(getSecretDisplayName).join(", ");
    return (
      <Tooltip
        title={t("runReadiness.missingKeysDetail", { keys })}
        placement="top"
        describeChild
      >
        <EditorButton
          className="run-readiness-missing-keys"
          variant="text"
          color="warning"
          startIcon={<KeyIcon fontSize="small" />}
          onClick={handleAddKey}
        >
          {t("runReadiness.addKey")}
        </EditorButton>
      </Tooltip>
    );
  }

  const hasPricedNodes =
    costEstimate !== null &&
    (costEstimate.total > 0 || costEstimate.unknown_count > 0);
  if (compact || !hasPricedNodes || costEstimate === null) {
    return null;
  }
  return (
    <Tooltip title={costTooltip(costEstimate, t)} placement="top" describeChild>
      <Caption className="run-readiness-cost" component="span">
        {costEstimate.total > 0
          ? t("runReadiness.costPerRun", { cost: formatUsd(costEstimate.total) })
          : t("runReadiness.costUnknown")}
      </Caption>
    </Tooltip>
  );
};

export default memo(RunReadinessHint);
