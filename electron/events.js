const { getMainWindow, serverState } = require('./state');

function emitBootMessage(message) {
  serverState.bootMsg = message;
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("boot-message", message);
  }
}

function emitServerStarted() {
  serverState.isStarted = true;
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("server-started");
  }
}

function emitServerLog(message) {
  serverState.logs.push(message);
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("server-log", message);
  }
}

function emitUpdateProgress(componentName, progress, action, eta) {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.send("update-progress", {
      componentName,
      progress,
      action,
      eta,
    });
  }
}

module.exports = {
  emitBootMessage,
  emitServerStarted,
  emitServerLog,
  emitUpdateProgress
}; 