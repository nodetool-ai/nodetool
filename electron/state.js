let mainWindow = null;
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  initialURL: "http://127.0.0.1:8000", // Default URL for the Python server
  logs: [],
};

module.exports = {
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => {
    mainWindow = window;
  },
  serverState,
};
