import React from "react";
import { Z_INDEX } from "../ui_primitives";

const ACTIVE_TAB_STYLE: React.CSSProperties = {
  opacity: 1,
  pointerEvents: "auto",
  zIndex: Z_INDEX.raised
};
const INACTIVE_TAB_STYLE: React.CSSProperties = {
  opacity: 0,
  pointerEvents: "none",
  zIndex: Z_INDEX.base
};

interface WorkspaceTabLayerProps {
  active: boolean;
  children: React.ReactNode;
}

/**
 * The layer one workspace tab renders into. Every open tab stays mounted so
 * its editor state survives a switch; only the active one is shown.
 *
 * Invariant: an inactive layer is `inert`. Its content is still in the DOM,
 * so it cannot take focus, and a global key listener inside it must not act
 * — a background Model Manager tab's search box once pulled focus off every
 * keystroke typed in the active tab. A component must never assume it is
 * the only mounted instance of itself.
 */
const WorkspaceTabLayer: React.FC<WorkspaceTabLayerProps> = ({
  active,
  children
}) => (
  <div
    className="tab-layer"
    style={active ? ACTIVE_TAB_STYLE : INACTIVE_TAB_STYLE}
    inert={!active}
  >
    {children}
  </div>
);

export default WorkspaceTabLayer;
