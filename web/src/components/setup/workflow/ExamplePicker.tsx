/**
 * The examples browser, inline in step 1 (PRD § 11.1: "the examples browser
 * inline. Picking one copies it, stage `done`, opens the canvas").
 *
 * It used to open the full Examples page in a tab of its own, and the flow
 * finished the moment the tab opened — so the creator came back to an empty
 * canvas and the example was never copied. The browser lives here now: the
 * pick and the copy are one action, and cancelling leaves the creator on the
 * idea step with their brief intact.
 *
 * The list is the same `["templates"]` query the dashboard's example browser
 * uses, so opening this costs nothing once either has loaded.
 */

import React, { memo, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import {
  AlertBanner,
  Caption,
  EditorButton,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  SearchInput,
  Text
} from "../../ui_primitives";
import { useWorkflowManager } from "../../../contexts/WorkflowManagerContext";
import type { Workflow, WorkflowList } from "../../../stores/ApiTypes";
import ReportBugButton from "../../support/ReportBugButton";
import { OptionCardGrid } from "../OptionCardGrid";
import type { OptionCardItem } from "../OptionCardGrid";

export interface WorkflowExamplePickerProps {
  /** Copies the picked example. The host owns where the copy lands. */
  onPick: (example: Workflow) => void;
  /** The example being copied, so the grid cannot be pressed twice. */
  pickingId?: string | null;
  /** Why the last copy was refused. */
  error?: string | null;
  /** Back to the idea step, with the brief still there. */
  onCancel: () => void;
}

const PickerInternal: React.FC<WorkflowExamplePickerProps> = ({
  onPick,
  pickingId = null,
  error = null,
  onCancel
}) => {
  const { t } = useTranslation();
  const loadTemplates = useWorkflowManager((state) => state.loadTemplates);
  const [query, setQuery] = useState("");
  const {
    data,
    isLoading,
    isError,
    error: listError,
    refetch
  } = useQuery<WorkflowList>({
    queryKey: ["templates"],
    queryFn: loadTemplates
  });

  const examples = useMemo(() => data?.workflows ?? [], [data]);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === "") {
      return examples;
    }
    return examples.filter((example) =>
      [example.name, example.description, ...(example.tags ?? [])]
        .filter((part): part is string => typeof part === "string")
        .join(" ")
        .toLowerCase()
        .includes(needle)
    );
  }, [examples, query]);

  const options = useMemo<OptionCardItem[]>(
    () =>
      matches.map((example) => ({
        id: example.id,
        title: example.name,
        description: example.description ?? undefined,
        // One copy at a time: a second press while the first is in flight
        // makes a second workflow nobody asked for.
        disabled: pickingId !== null,
        disabledReason:
          pickingId === example.id
            ? t("pass3_14.workflowSetup.examples.copyingThisExample")
            : t("pass3_14.workflowSetup.examples.copyingExample")
      })),
    [matches, pickingId, t]
  );

  return (
    <FlexColumn gap={GAP.comfortable}>
      <FlexColumn gap={GAP.tight}>
        <Text size="big" component="h2">
          {t("pass3_14.workflowSetup.examples.title")}
        </Text>
        <Text size="normal" color="secondary">
          {t("pass3_14.workflowSetup.examples.description")}
        </Text>
      </FlexColumn>

      {error ? (
        <AlertBanner
          severity="error"
          action={
            <ReportBugButton
              context={{
                source: "operation-failure",
                summary: t("pass3_14.workflowSetup.examples.copyFailed"),
                errorText: error
              }}
            />
          }
        >
          {error}
        </AlertBanner>
      ) : null}

      <FlexRow gap={GAP.normal} align="center" wrap>
        {/* The card that opened this browser is gone, so the keyboard lands
            here rather than on the page. */}
        <SearchInput
          autoFocus
          value={query}
          onChange={setQuery}
          placeholder={t("pass3_14.workflowSetup.examples.searchPlaceholder")}
          aria-label={t("pass3_14.workflowSetup.examples.searchLabel")}
          showClear
        />
        {/* A copy cannot be stopped once asked for, and it opens what it
            copied when it lands. Leaving meanwhile would be undone by that. */}
        <EditorButton
          variant="text"
          onClick={onCancel}
          disabled={pickingId !== null}
        >
          {t("pass3_14.workflowSetup.examples.backToIdea")}
        </EditorButton>
      </FlexRow>

      {isLoading ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {t("pass3_14.workflowSetup.examples.loading")}
          </Caption>
        </FlexRow>
      ) : isError ? (
        <AlertBanner
          severity="error"
          action={
            <FlexRow gap={GAP.tight} align="center">
              <EditorButton
                variant="text"
                onClick={() => {
                  void refetch();
                }}
              >
                {t("pass3_14.workflowSetup.examples.tryAgain")}
              </EditorButton>
              <ReportBugButton
                context={{
                  source: "operation-failure",
                  summary: t("pass3_14.workflowSetup.examples.readFailed"),
                  errorText:
                    listError?.message ??
                    t("pass3_14.workflowSetup.examples.readError")
                }}
              />
            </FlexRow>
          }
        >
          <Caption component="span">
            {t("pass3_14.workflowSetup.examples.readError")}
          </Caption>
        </AlertBanner>
      ) : matches.length === 0 ? (
        <EmptyState
          title={
            examples.length === 0
              ? t("pass3_14.workflowSetup.examples.emptyTitle")
              : t("pass3_14.workflowSetup.examples.noMatchesTitle")
          }
          description={
            examples.length === 0
              ? t("pass3_14.workflowSetup.examples.emptyDescription")
              : t("pass3_14.workflowSetup.examples.noMatchesDescription")
          }
        />
      ) : (
        <OptionCardGrid
          label={t("pass3_14.workflowSetup.examples.gridLabel")}
          options={options}
          onSelect={(id) => {
            const example = matches.find((entry) => entry.id === id);
            if (example) {
              onPick(example);
            }
          }}
          minColumnWidth={260}
        />
      )}

      {pickingId !== null ? (
        <FlexRow gap={GAP.normal} align="center">
          <LoadingSpinner size="small" />
          <Caption color="secondary" component="span">
            {t("pass3_14.workflowSetup.examples.copyingProgress")}
          </Caption>
        </FlexRow>
      ) : null}
    </FlexColumn>
  );
};

export const WorkflowExamplePicker = memo(PickerInternal);
WorkflowExamplePicker.displayName = "WorkflowExamplePicker";

export default WorkflowExamplePicker;
