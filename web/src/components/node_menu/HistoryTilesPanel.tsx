/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import { memo, useMemo } from "react";

import { Text } from "../ui_primitives";
import SearchResultsPanel from "./SearchResultsPanel";
import useMetadataStore from "../../stores/MetadataStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";

const styles = (theme: Theme) =>
  css({
    "&.history-tiles": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: theme.spacing(1),
      boxSizing: "border-box",
      minHeight: 0
    },
    ".history-list": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    },
    ".history-empty": {
      padding: theme.spacing(2),
      color: theme.vars.palette.text.secondary,
      textAlign: "center"
    }
  });

/**
 * Left-panel History view: virtualized list of recently-used nodes,
 * resolved against MetadataStore. Same compact row style as Search.
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
      <div className="history-list">
        {nodes.length === 0 ? (
          <Text className="history-empty">No recent nodes yet</Text>
        ) : (
          <SearchResultsPanel searchNodes={nodes} compact />
        )}
      </div>
    </div>
  );
});

HistoryTilesPanel.displayName = "HistoryTilesPanel";

export default HistoryTilesPanel;
