/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import CloseIcon from "@mui/icons-material/Close";
import AccountTreeIcon from "@mui/icons-material/AccountTree";
import { memo, useCallback } from "react";
import type { SubgraphTab } from "../../stores/SubgraphTabsStore";

const SUBGRAPH_ACCENT = "#7C3AED";

const styles = css({
  "&.tab": {
    paddingLeft: "12px",
    borderLeft: `2px solid ${SUBGRAPH_ACCENT}`,
    color: SUBGRAPH_ACCENT
  },
  "&.tab.active": {
    background: `${SUBGRAPH_ACCENT}1A`,
    color: SUBGRAPH_ACCENT,
    "&::before": {
      background: SUBGRAPH_ACCENT
    }
  },
  "& .subgraph-icon": {
    fontSize: "12px",
    flexShrink: 0
  },
  "& .subgraph-label": {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    minWidth: 0
  }
});

interface SubgraphTabHeaderProps {
  tab: SubgraphTab;
  isActive: boolean;
  onSelect: (key: string) => void;
  onClose: (key: string) => void;
}

const SubgraphTabHeader = ({
  tab,
  isActive,
  onSelect,
  onClose
}: SubgraphTabHeaderProps) => {
  const handleClick = useCallback(() => {
    onSelect(tab.key);
  }, [tab.key, onSelect]);

  const handleClose = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onClose(tab.key);
    },
    [tab.key, onClose]
  );

  return (
    <div
      css={styles}
      className={`tab subgraph-tab ${isActive ? "active" : ""}`}
      onClick={handleClick}
      title={`Subgraph: ${tab.label}`}
    >
      <AccountTreeIcon className="subgraph-icon" />
      <span className="subgraph-label">{tab.label}</span>
      <CloseIcon className="close-icon" onClick={handleClose} />
    </div>
  );
};

export default memo(SubgraphTabHeader);
