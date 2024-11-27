let mainWindow = null;
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: null,
  logs: [],
};

module.exports = {
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => {
    mainWindow = window;
  },
  serverState,
};
