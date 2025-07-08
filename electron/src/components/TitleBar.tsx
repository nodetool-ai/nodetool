import React, { useEffect } from 'react';

const TitleBar: React.FC = () => {
  useEffect(() => {
    const handleMinimize = () => {
      window.api.windowControls.minimize();
    };

    const handleMaximize = () => {
      window.api.windowControls.maximize();
    };

    const handleClose = () => {
      window.api.windowControls.close();
    };

    // Add event listeners after component mounts
    const minimizeBtn = document.querySelector('.window-control-button:nth-child(1)');
    const maximizeBtn = document.querySelector('.window-control-button:nth-child(2)');
    const closeBtn = document.querySelector('#close-button');

    if (minimizeBtn) {
      minimizeBtn.addEventListener('click', handleMinimize);
    }
    if (maximizeBtn) {
      maximizeBtn.addEventListener('click', handleMaximize);
    }
    if (closeBtn) {
      closeBtn.addEventListener('click', handleClose);
    }

    // Cleanup
    return () => {
      if (minimizeBtn) {
        minimizeBtn.removeEventListener('click', handleMinimize);
      }
      if (maximizeBtn) {
        maximizeBtn.removeEventListener('click', handleMaximize);
      }
      if (closeBtn) {
        closeBtn.removeEventListener('click', handleClose);
      }
    };
  }, []);

  return (
    <div className="title-bar">
      <div style={{ flex: 1 }}></div>
      <div className="window-controls">
        <button className="window-control-button">&#x2014;</button>
        <button className="window-control-button">&#x2610;</button>
        <button className="window-control-button" id="close-button">
          &#x2715;
        </button>
      </div>
    </div>
  );
};

export default TitleBar;