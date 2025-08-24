import React from "react";

const TitleBar: React.FC = () => {
  const handleMinimize = () => {
    window.api.windowControls.minimize();
  };

  const handleMaximize = () => {
    window.api.windowControls.maximize();
  };

  const handleClose = () => {
    window.api.windowControls.close();
  };

  return (
    <div className="title-bar">
      <div className="title-spacer" />
      <div className="title-center">
        <div className="title-bar-text">NodeTool Package Manager</div>
      </div>
      <div className="window-controls">
        <button
          className="window-control-button"
          onClick={handleMinimize}
          title="Minimize"
        >
          &#x2014;
        </button>
        <button
          className="window-control-button"
          onClick={handleMaximize}
          title="Maximize"
        >
          &#x2610;
        </button>
        <button
          className="window-control-button close-button"
          onClick={handleClose}
          title="Close"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
