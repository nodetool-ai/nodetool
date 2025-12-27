import React, { memo, useCallback } from "react";

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px"
};

const baseButtonStyle: React.CSSProperties = {
  appearance: "none",
  WebkitAppearance: "none",
  background: "transparent",
  border: "0",
  outline: "none",
  width: "24px",
  height: "24px",
  lineHeight: "22px",
  textAlign: "center",
  borderRadius: "6px",
  color: "inherit",
  cursor: "pointer"
};

const hoverStyle: React.CSSProperties = {
  background: "action.hover"
};

const closeHoverStyle: React.CSSProperties = {
  background: "error.main",
  color: "error.contrastText"
};

const TitleBar: React.FC = memo(function TitleBar() {
  const minimize = useCallback(() => {
    (window as any)?.api?.windowControls?.minimize?.();
  }, []);

  const maximize = useCallback(() => {
    (window as any)?.api?.windowControls?.maximize?.();
  }, []);

  const close = useCallback(() => {
    (window as any)?.api?.windowControls?.close?.();
  }, []);

  return (
    <div
      style={{ ...(containerStyle as any), WebkitAppRegion: "no-drag" } as any}
    >
      <button
        style={baseButtonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyle)}
        onMouseLeave={(e) =>
          Object.assign(e.currentTarget.style, baseButtonStyle)
        }
        onClick={minimize}
        aria-label="Minimize window"
        title="Minimize"
      >
        —
      </button>
      <button
        style={baseButtonStyle}
        onMouseEnter={(e) => Object.assign(e.currentTarget.style, hoverStyle)}
        onMouseLeave={(e) =>
          Object.assign(e.currentTarget.style, baseButtonStyle)
        }
        onClick={maximize}
        aria-label="Maximize window"
        title="Maximize"
      >
        ▢
      </button>
      <button
        style={baseButtonStyle}
        onMouseEnter={(e) =>
          Object.assign(e.currentTarget.style, closeHoverStyle)
        }
        onMouseLeave={(e) =>
          Object.assign(e.currentTarget.style, baseButtonStyle)
        }
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
