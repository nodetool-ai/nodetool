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
  const pythonExecutable = path.join("python", 'bin', 'python');
  const env = Object.create(process.env);
  env.PYTHONUNBUFFERED = "1";
  env.PYTHONPATH = "src";

  serverProcess = spawn(pythonExecutable, ["-m", "nodetool.cli", "serve"], {
    "env": env
  });

  serverProcess.stdout.on('data', (data) => {
    console.log(data.toString());
    if (data.toString().includes("Application startup complete.")) {
      mainWindow.webContents.send('server-started');
    }
      
    if (mainWindow) {
      mainWindow.webContents.send('server-log', data.toString());
    }
  });

  serverProcess.stderr.on('data', (data) => {
    console.log(data.toString());
    if (data.toString().includes("Application startup complete.")) {
      mainWindow.webContents.send('server-started');
    }
  if (mainWindow) {[]
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