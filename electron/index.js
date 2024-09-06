const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const tar = require("tar");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

async function runCondaUnpack() {
  const executable =
    process.platform === "win32"
      ? path.join(userDataPath, "python_env", "Scripts", "conda-unpack.exe")
      : path.join(userDataPath, "python_env", "bin", "conda-unpack");

  const condaUnpackProcess = spawn(executable, []);

  return new Promise((resolve, reject) => {
    condaUnpackProcess.on("close", (code) => {
      if (code === 0) {
        console.log("conda-unpack completed successfully");
        resolve();
      } else {
        reject(new Error(`conda-unpack process exited with code ${code}`));
      }
    });
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500,
    height: 1000,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  mainWindow.loadFile("index.html");

  mainWindow.on("closed", function () {
    mainWindow = null
  });
}

async function startServer() {
  const resourcesPath = process.resourcesPath;
  const env = Object.create(process.env);
  let webDir;
  
  console.log("resourcesPath", resourcesPath);

  mainWindow.webContents.send("boot-message", "Initializing NodeTool");

  const pythonEnvExecutable = path.join(resourcesPath, "python_env", "python.exe");
  const pythonEnvExists = await fs.stat(pythonEnvExecutable).catch(() => false);

  env.PYTHONUNBUFFERED = "1";
  
  if (pythonEnvExists) {
    // this is the case when the app is run from a built state
    env.PYTHONPATH = path.join(resourcesPath, "src");
    env.PATH = `${resourcesPath};${env.PATH}`;
    webDir = path.join(resourcesPath, "web");
  } else {
    // this is the case when the app is run from source
    env.PYTHONPATH = path.join("..", "src");
    webDir = path.join("..", "web", "dist");
  }

  serverProcess = spawn(
    pythonEnvExists ? pythonEnvExecutable : "python",
    ["-m", "nodetool.cli", "serve", "--static-folder", webDir],
    {
      env: env,
    }
  );

  serverProcess.stdout.on("data", (data) => {
    console.log(data.toString());
    if (data.toString().includes("Application startup complete.")) {
      mainWindow.webContents.send("server-started");
    }

    if (mainWindow) {
      mainWindow.webContents.send("server-log", data.toString());
    }
  });

  serverProcess.stderr.on("data", (data) => {
    console.log(data.toString());
    if (data.toString().includes("Application startup complete.")) {
      mainWindow.webContents.send("server-started");
    }
    if (mainWindow) {
      [];
      mainWindow.webContents.send("server-log", data.toString());
    }
  });
  
  ollamaProcess = spawn(
    path.join(resourcesPath, "ollama", "ollama.exe"),
    ["serve"],
  );
  
  ollamaProcess.stdout.on("data", (data) => {
    console.log(data.toString());
  });

  ollamaProcess.stderr.on("data", (data) => {
    console.log(data.toString());
  });
}

app.on("ready", () => {
  createWindow();
  startServer();
});

app.on("window-all-closed", function () {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", function () {
  if (mainWindow === null) createWindow();
});

app.on("quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
