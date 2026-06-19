import * as React from "react";
import { Tooltip } from "nodetool";

export const RunHint = () => (
  <div style={{ paddingTop: 60, display: "flex", justifyContent: "center" }}>
    <Tooltip
      title="Run workflow (⌘↵)"
      open
      arrow
      placement="bottom"
      PopperProps={{ disablePortal: true }}
    >
      <span
        style={{
          display: "inline-block",
          padding: "6px 14px",
          borderRadius: 6,
          background: "var(--palette-primary-main)",
          color: "#08090A",
          fontSize: 13,
          fontWeight: 600
        }}
      >
        Run
      </span>
    </Tooltip>
  </div>
);
