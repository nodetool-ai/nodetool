import React from 'react';

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
      <div style={{ flex: 1 }}></div>
      <div className="window-controls">
        <button className="window-control-button" onClick={handleMinimize}>
          &#x2014;
        </button>
        <button className="window-control-button" onClick={handleMaximize}>
          &#x2610;
        </button>
        <button className="window-control-button" id="close-button" onClick={handleClose}>
          &#x2715;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;