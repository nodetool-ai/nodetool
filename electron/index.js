const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const tar = require('tar');
const { spawn } = require('child_process');
const envDir = path.join(app.getPath('userData'), 'python_env');
const srcDir = path.join(app.getPath('userData'), 'src');

let mainWindow;
let serverProcess;

async function setupPythonEnvironment() {
  try {
    // Find the Resources folder
    console.log('Resources path:', process.resourcesPath);

    // Define paths
    const envTarPath = path.join(process.resourcesPath, 'python_env.tar');
    const srcTarPath = path.join(process.resourcesPath, 'nodetool.tar');
    
    // Unpack nodetool source
    if (await fs.access(srcDir).then(() => true).catch(() => false)) {
      console.log('Nodetool source already unpacked');
    } else {
      console.log('Unpacking nodetool source...');
      await tar.x({
        file: srcTarPath,
        C: app.getPath('userData')
      });
      console.log('Nodetool source unpacked successfully');
    }

    // Check if environment is already set up
    if (await fs.access(envDir).then(() => true).catch(() => false)) {
      console.log('Python environment already set up');
      return;
    }

    console.log('Setting up Python environment...');
    
    mainWindow.webContents.send('boot-message', 'Setting up Python environment...');

    // Create environment directory
    await fs.mkdir(envDir, { recursive: true });

    // Get the total size of the tar file
    const stats = await fs.stat(envTarPath);
    const totalSize = stats.size;
    let extractedSize = 0;

    await tar.x({
      file: envTarPath,
      C: envDir,
      onentry: (entry) => {
        extractedSize += entry.size;
        const progress = Math.round((extractedSize / totalSize) * 100);
        mainWindow.webContents.send('extraction-progress', progress);
      }
    });

    console.log('Environment unpacked successfully');
    mainWindow.webContents.send('boot-message', 'Environment unpacked successfully');

    const condaUnpack = path.join(envDir, 'bin', 'conda-unpack');
    const condaUnpackProcess = spawn(condaUnpack, []);

    await new Promise((resolve, reject) => {
      condaUnpackProcess.on('close', (code) => {
        if (code === 0) {
          console.log('conda-unpack completed successfully');
          resolve();
        } else {
          reject(new Error(`conda-unpack process exited with code ${code}`));
        }
      });
    });

    console.log('Environment unpacked successfully');
    mainWindow.webContents.send('boot-message', 'Environment unpacked successfully');

  } catch (error) {
    console.error('Error setting up Python environment:', error);
  }
}

module.exports = setupPythonEnvironment;

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

async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    await setupPythonEnvironment();
   }

  const pythonExecutable = process.env.NODE_ENV === 'production' ? path.join(envDir, 'bin', 'python') : "python";
  const staticFolder = "../web/dist";

  // const pythonExecutable = path.join("python", 'bin', 'python');
  const env = Object.create(process.env);
  env.PYTHONUNBUFFERED = "1";
  env.PYTHONPATH = process.env.NODE_ENV === 'production' ? srcDir : "../src"
  
  mainWindow.webContents.send('boot-message', 'Starting server...');

  serverProcess = spawn(pythonExecutable, ["-m", "nodetool.cli", "serve", "--static-folder", staticFolder], {
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
  createWindow();
  startServer();
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