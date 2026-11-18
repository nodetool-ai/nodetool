/**
 * Settings → Permissions.
 *
 * Every tool the assistant can ask about, grouped by what it works on, with
 * "Always allow" or "Ask" each. The chat card's "Always allow" writes the same
 * rule, so a tool approved there shows here and can be set back to Ask.
 */

import { memo, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  ToolPermissionGroup,
  ToolPermissionRule
} from "@nodetool-ai/protocol/api-schemas/settings.js";
import { useToolPermissions } from "../../serverState/useToolPermissions";
import ErrorBanner from "../support/ErrorBanner";
import {
  Caption,
  EmptyState,
  FlexColumn,
  FlexRow,
  GAP,
  LoadingSpinner,
  Text,
  ToggleGroup,
  ToggleOption
} from "../ui_primitives";
import { toolDisplayName } from "../../utils/toolDisplayName";

interface ToolPermissionsSettingsProps {
  /** The Settings page search, matched against tool names and descriptions. */
  search?: string;
}

function filterGroups(
  groups: ToolPermissionGroup[],
  search: string
): ToolPermissionGroup[] {
  const query = search.trim().toLowerCase();
  if (!query) {
    return groups;
  }
  return groups
    .map((group) => ({
      ...group,
      tools: group.title.toLowerCase().includes(query)
        ? group.tools
        : group.tools.filter(
            (tool) =>
              tool.name.toLowerCase().includes(query) ||
              toolDisplayName(tool.name).toLowerCase().includes(query) ||
              tool.description.toLowerCase().includes(query)
          )
    }))
    .filter((group) => group.tools.length > 0);
}

/** The id a group's heading carries, for the sidebar to scroll to. */
export const toolPermissionGroupAnchor = (groupId: string): string =>
  `tool-permissions-${groupId}`;

const ToolPermissionsSettings = ({ search = "" }: ToolPermissionsSettingsProps) => {
  const { t } = useTranslation();
  const { groups, isLoading, error, refetch, setRule } = useToolPermissions();
  const [failure, setFailure] = useState<string | null>(null);
  const visible = useMemo(() => filterGroups(groups, search), [groups, search]);

  const choose = useCallback(
    (name: string, rule: ToolPermissionRule | null) => {
      // A click on the selected option deselects it; keep the current rule.
      if (rule === null) {
        return;
      }
      setFailure(null);
      setRule({ name, rule }).catch((reason: unknown) => {
        setFailure(reason instanceof Error ? reason.message : String(reason));
      });
    },
    [setRule]
  );

  return (
    <div className="settings-section tool-permissions">
      <Text size="big" id="tool-permissions" className="settings-heading">
        {t("toolPermissions.title")}
      </Text>
      <Caption className="description">{t("toolPermissions.intro")}</Caption>
      <Caption className="description">{t("toolPermissions.modes")}</Caption>

      {failure !== null && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Saving a tool permission failed",
            errorText: failure
          }}
          onDismiss={() => setFailure(null)}
        >
          {t("toolPermissions.saveFailed")}
        </ErrorBanner>
      )}

      {isLoading && <LoadingSpinner size="small" />}

      {error && (
        <ErrorBanner
          report={{
            source: "operation-failure",
            summary: "Loading tool permissions failed",
            errorText: error.message
          }}
          onRetry={refetch}
        >
          {t("toolPermissions.loadFailed")}
        </ErrorBanner>
      )}

      {!isLoading && !error && visible.length === 0 && (
        <EmptyState
          variant="no-results"
          title={t("toolPermissions.noMatches")}
        />
      )}

      {visible.map((group) => (
        <FlexColumn
          key={group.id}
          gap={GAP.normal}
          className="settings-item"
          component="section"
          aria-labelledby={toolPermissionGroupAnchor(group.id)}
        >
          <Text
            id={toolPermissionGroupAnchor(group.id)}
            weight={600}
            component="h3"
          >
            {group.title}
          </Text>
          {group.tools.map((tool) => {
            const labelId = `tool-permission-${tool.name}`;
            return (
              <FlexRow
                key={tool.name}
                gap={GAP.normal}
                align="center"
                justify="space-between"
                wrap
              >
                <FlexColumn gap={GAP.none} sx={{ flex: 1, minWidth: 0 }}>
                  <Text id={labelId} title={tool.name}>
                    {toolDisplayName(tool.name)}
                  </Text>
                  {tool.description && <Caption>{tool.description}</Caption>}
                </FlexColumn>
                <ToggleGroup
                  value={tool.rule}
                  exclusive
                  segmented
                  aria-labelledby={labelId}
                  onChange={(_event, value: ToolPermissionRule | null) =>
                    choose(tool.name, value)
                  }
                >
                  <ToggleOption value="always_allow">
                    {t("toolPermissions.alwaysAllow")}
                  </ToggleOption>
                  <ToggleOption value="ask">{t("toolPermissions.ask")}</ToggleOption>
                </ToggleGroup>
              </FlexRow>
            );
          })}
        </FlexColumn>
      ))}
    </div>
  );
};

export default memo(ToolPermissionsSettings);
