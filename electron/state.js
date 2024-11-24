let mainWindow = null;
let serverState = {
  isStarted: false,
  bootMsg: "Initializing...",
  logs: [],
};

module.exports = {
  getMainWindow: () => mainWindow,
  setMainWindow: (window) => { mainWindow = window },
  serverState
}; 