import React from "react";
import "./WindowControls.css";

/**
 * WindowControls component that provides window minimization, maximization,
 * and closing functionality. Uses Electron's clipboard API for clipboard operations.
 */

declare global {
  interface Window {
    windowControls?: {
      minimize: () => void;
      maximize: () => void;
      close: () => void;
    };
  }
}

export const WindowControls: React.FC = () => {
  const handleMinimize = () => {
    window.windowControls?.minimize();
  };

  const handleMaximize = () => {
    window.windowControls?.maximize();
  };

  const handleClose = () => {
    window.windowControls?.close();
  };

  return (
    <div className="window-controls">
      <button className="window-control-button" onClick={handleMinimize}>
        &#x2014;
      </button>
      <button className="window-control-button" onClick={handleMaximize}>
        &#x2610;
      </button>
      <button
        className="window-control-button"
        id="close-button"
        onClick={handleClose}
      >
        &#x2715;
      </button>
    </div>
  );
};
