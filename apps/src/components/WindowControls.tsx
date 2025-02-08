import React from "react";
import "./WindowControls.css";

interface WindowControls {
  minimize: () => void;
  maximize: () => void;
  close: () => void;
}

declare global {
  interface Window {
    windowControls?: WindowControls;
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
