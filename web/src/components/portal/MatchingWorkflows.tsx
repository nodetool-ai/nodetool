/**
 * The "Workflows that match" row under the Apps tab's search. The Workflows
 * tab holds most examples, so an Apps search that names a job also names the
 * workflows that do it. UX research study 13: a participant searched the
 * Apps tab for "jargon", found no app, and never learned the Workflows tab
 * had the plain-language rewrite example.
 */

import { memo, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import type { WorkflowList as WorkflowListType } from "../../stores/ApiTypes";
import { useWorkflowManager } from "../../contexts/WorkflowManagerContext";
import { useWorkflowActions } from "../../hooks/useWorkflowActions";
import { runsAsIs } from "../../utils/exampleNeeds";
import { matchesSearch } from "../../utils/matchesSearch";
import { Caption, Chip, FlexRow, GAP, SPACING } from "../ui_primitives";

/** Chips shown before the row stops; the Workflows tab lists the rest. */
const MAX_MATCHES = 6;

interface MatchingWorkflowsProps {
  query: string;
}

const MatchingWorkflows = ({ query }: MatchingWorkflowsProps) => {
  const { t } = useTranslation();
  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);
  const { handleExampleClick, loadingExampleId } = useWorkflowActions();
  const q = query.trim();

  const { data } = useQuery<WorkflowListType>({
    queryKey: ["templates"],
    queryFn: loadTemplates,
    enabled: q !== ""
  });

  const matches = useMemo(() => {
    if (!q || !data) {
      return [];
    }
    return data.workflows
      .filter((w) =>
        matchesSearch(
          [w.name, w.description, ...(w.tags ?? [])].filter(Boolean).join(" "),
          q
        )
      )
      .sort((a, b) => Number(runsAsIs(b.needs)) - Number(runsAsIs(a.needs)))
      .slice(0, MAX_MATCHES);
  }, [data, q]);

  if (matches.length === 0) {
    return null;
  }
  return (
    <FlexRow
      align="center"
      gap={GAP.tight}
      wrap
      role="group"
      aria-label={t("pass3_16.portal.apps.matchingWorkflows")}
      sx={{ paddingBottom: SPACING.md }}
    >
      <Caption color="secondary">
        {t("pass3_16.portal.apps.matchingWorkflows")}
      </Caption>
      {matches.map((workflow) => (
        <Chip
          key={workflow.id}
          compact
          label={workflow.name}
          disabled={loadingExampleId !== null}
          onClick={() => void handleExampleClick(workflow)}
        />
      ))}
    </FlexRow>
  );
};

export default memo(MatchingWorkflows);
