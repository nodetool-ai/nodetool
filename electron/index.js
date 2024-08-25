const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let serverProcess;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('closed', function () {
    mainWindow = null;
  });
}

function startServer() {
  const pythonExecutable = path.join(__dirname, ".venv", 'bin', 'python');

  serverProcess = spawn(pythonExecutable, ["-m", "nodetool.cli", "server"], {
    "PYTHONPATH": "src"
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(`Server output: ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send('server-log', data.toString());
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.error(`Server error: ${data}`);
    if (mainWindow) {
      mainWindow.webContents.send('server-log', data.toString());
    }
  });
}

app.on('ready', () => {
  startServer();
  createWindow();
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
  if (mainWindow === null) createWindow();
});

app.on('quit', () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});