/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";

import { Text, ScrollArea } from "../ui_primitives";
import QuickAccessTile from "./QuickAccessTile";
import useMetadataStore from "../../stores/MetadataStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";

const styles = (theme: Theme) =>
  css({
    "&.history-tiles": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: theme.spacing(1),
      boxSizing: "border-box"
    },
    ".history-grid": {
      display: "grid",
      gridTemplateColumns: "1fr 1fr",
      gap: theme.spacing(1),
      paddingBottom: theme.spacing(1)
    },
    ".history-empty": {
      padding: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    }
  });

/**
 * Left-panel-safe history view: pulls recent node_types from
 * `RecentNodesStore` and resolves them against `MetadataStore`, then renders
 * `QuickAccessTile`s. Routes click-to-add via `PendingNodeCreateStore` so it
 * works from outside the `ReactFlowProvider`.
 */
const HistoryTilesPanel = memo(() => {
  const theme = useTheme();
  const recent = useRecentNodesStore((s) => s.recentNodes);
  const metadataRecord = useMetadataStore((s) => s.metadata);

  const nodes = useMemo(
    () =>
      recent
        .map((r) => metadataRecord[r.nodeType])
        .filter((m): m is NonNullable<typeof m> => Boolean(m)),
    [recent, metadataRecord]
  );

  return (
    <div css={styles(theme)} className="history-tiles">
      <ScrollArea fullHeight>
        {nodes.length === 0 ? (
          <Text className="history-empty">No recent nodes yet</Text>
        ) : (
          <div className="history-grid">
            {nodes.map((n) => (
              <QuickAccessTile key={n.node_type} node={n} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
});

HistoryTilesPanel.displayName = "HistoryTilesPanel";

export default HistoryTilesPanel;
