/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { memo, useMemo } from "react";

import { EmptyState, FlexColumn } from "../ui_primitives";
import SearchResultsPanel from "./SearchResultsPanel";
import useMetadataStore from "../../stores/MetadataStore";
import { useRecentNodesStore } from "../../stores/RecentNodesStore";

const styles = () =>
  css({
    "&.history-tiles": {
      display: "flex",
      flexDirection: "column",
      height: "100%",
      padding: 0,
      boxSizing: "border-box",
      minHeight: 0
    },
    ".history-list": {
      flex: 1,
      minHeight: 0,
      display: "flex",
      flexDirection: "column"
    }
  });

/**
 * Left-panel History view: virtualized list of recently-used nodes,
 * resolved against MetadataStore. Same compact row style as Search.
 */
const HistoryTilesPanel = memo(() => {
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
    <div css={styles()} className="history-tiles">
      <div className="history-list">
        {nodes.length === 0 ? (
          <FlexColumn gap={2} justify="center" align="center" sx={{ flex: 1, px: 2 }}>
            <EmptyState
              title="No recent nodes yet"
              description="Nodes you use will appear here."
            />
          </FlexColumn>
        ) : (
          <SearchResultsPanel searchNodes={nodes} compact />
        )}
      </div>
    </div>
  );
});

HistoryTilesPanel.displayName = "HistoryTilesPanel";

export default HistoryTilesPanel;
