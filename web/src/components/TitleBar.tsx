/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import React, { memo, useCallback } from "react";

const styles = css({
  display: "flex",
  alignItems: "center",
  gap: "6px",
  WebkitAppRegion: "no-drag",
  "& button": {
    appearance: "none",
    WebkitAppearance: "none",
    background: "transparent",
    border: 0,
    outline: "none",
    width: "24px",
    height: "24px",
    lineHeight: "22px",
    textAlign: "center",
    borderRadius: "var(--rounded-md)",
    color: "inherit",
    cursor: "pointer",
    "&:hover": {
      background: "var(--palette-action-hover)"
    }
  },
  "& .close-btn:hover": {
    background: "var(--palette-error-main)",
    color: "var(--palette-error-contrastText)"
  }
});

const TitleBar: React.FC = memo(function TitleBar() {
  const minimize = useCallback(() => {
    window.api?.windowControls?.minimize?.();
  }, []);

  const maximize = useCallback(() => {
    window.api?.windowControls?.maximize?.();
  }, []);

  const close = useCallback(() => {
    window.api?.windowControls?.close?.();
  }, []);

  return (
    <div css={styles}>
      <button onClick={minimize} aria-label="Minimize window" title="Minimize">
        —
      </button>
      <button onClick={maximize} aria-label="Maximize window" title="Maximize">
        ▢
      </button>
      <button
        className="close-btn"
        onClick={close}
        aria-label="Close window"
        title="Close"
      >
        ✕
      </button>
    </div>
  );
});

TitleBar.displayName = "TitleBar";

export default TitleBar;
