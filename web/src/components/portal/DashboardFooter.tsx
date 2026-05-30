/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import type { Theme } from "@mui/material/styles";
import { useTheme } from "@mui/material/styles";
import { memo } from "react";
import { wrapStyles } from "./dashboardChrome";

const styles = (theme: Theme) =>
  css({
    marginTop: 8,
    borderTop: `1px solid ${theme.vars.palette.divider}`,
    ".foot-wrap": {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      gap: 8,
      flexWrap: "wrap",
      minHeight: 46,
      padding: "10px 40px",
      fontSize: 12,
      color: theme.vars.palette.text.disabled,
      [theme.breakpoints.down("sm")]: { padding: "10px 18px" }
    },
    ".foot-links button": {
      background: "none",
      border: "none",
      padding: 0,
      cursor: "pointer",
      font: "inherit",
      color: theme.vars.palette.text.secondary,
      "&:hover": { color: theme.vars.palette.primary.main }
    },
    ".foot-sep": { color: theme.vars.palette.divider, margin: "0 8px" },
    ".foot-stat": { fontFamily: theme.fontFamily2 }
  });

interface DashboardFooterProps {
  workflowCount: number;
  onGettingStarted: () => void;
}

const DashboardFooter: React.FC<DashboardFooterProps> = ({
  workflowCount,
  onGettingStarted
}) => {
  const theme = useTheme();
  return (
    <footer css={styles(theme)}>
      <div css={wrapStyles(theme)} className="foot-wrap">
        <span className="foot-links">
          <button type="button" onClick={onGettingStarted}>
            Getting started
          </button>
        </span>
        <span className="foot-stat">
          {workflowCount} {workflowCount === 1 ? "workflow" : "workflows"}
        </span>
        <span className="foot-stat">nodetool</span>
      </div>
    </footer>
  );
};

export default memo(DashboardFooter);
