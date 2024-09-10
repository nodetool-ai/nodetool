/*
  This file is the entry point for the Electron app.
  It is responsible for creating the main window and starting the server.
*/
const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;
let pythonExecutable;
let pipExecutable;
let sitePackagesDir;
let webDir;
const resourcesPath = process.resourcesPath;
let env = process.env;
env.PYTHONUNBUFFERED = "1";

const windowsPipArgs = [
  "install",
  "-r",
  path.join(resourcesPath, "requirements.txt"),
  "--extra-index-url",
  "https://download.pytorch.org/whl/cu121",
];
const macPipArgs = [
  "install",
  "-r",
  path.join(resourcesPath, "requirements.txt"),
];

async function installRequirements() {
  const pipProcess = spawn(
    pipExecutable,
    process.platform === "darwin" ? macPipArgs : windowsPipArgs
  );

  mainWindow.webContents.send("boot-message", "Installing requirements");

  pipProcess.stdout.on("data", (data) => {
    console.log(data.toString());
    if (mainWindow) {
      mainWindow.webContents.send("server-log", data.toString());
    }
  });

  pipProcess.stderr.on("data", (data) => {
    console.log(data.toString());
    if (mainWindow) {
      mainWindow.webContents.send("server-log", data.toString());
    }
  });

  return new Promise((resolve, reject) => {
    pipProcess.on("close", (code) => {
      if (code === 0) {
        console.log("pip install completed successfully");
        resolve();
      } else {
        reject(new Error(`pip install process exited with code ${code}`));
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
    mainWindow = null;
  });
}

function runNodeTool(env) {
  const serverProcess = spawn(
    pythonExecutable,
    ["-m", "nodetool.cli", "serve", "--static-folder", webDir],
    {
      env: env,
    }
  );

  function handleServerOutput(data) {
    console.log(data.toString());
    if (data.toString().includes("Application startup complete.")) {
      mainWindow.webContents.send("server-started");
    }

    if (mainWindow) {
      mainWindow.webContents.send("server-log", data.toString());
    }
  }

  serverProcess.stdout.on("data", handleServerOutput);
  serverProcess.stderr.on("data", handleServerOutput);
}

async function startServer() {
  let pythonEnvExecutable, pipEnvExecutable;

  if (process.platform === "darwin") {
    pythonEnvExecutable = path.join(
      resourcesPath,
      "python_env",
      "bin",
      "python"
    );
    pipEnvExecutable = path.join(resourcesPath, "python_env", "bin", "pip");
  } else {
    pythonEnvExecutable = path.join(resourcesPath, "python_env", "python.exe");
    pipEnvExecutable = path.join(
      resourcesPath,
      "python_env",
      "Scripts",
      "pip.exe"
    );
  }

  const pythonEnvExists = await fs.stat(pythonEnvExecutable).catch(() => false);

  pythonExecutable = pythonEnvExists ? pythonEnvExecutable : "python";
  pipExecutable = pythonEnvExists ? pipEnvExecutable : "pip";
  sitePackagesDir = pythonEnvExists
    ? process.platform === "darwin"
      ? path.join(
          resourcesPath,
          "python_env",
          "lib",
          "python3.11",
          "site-packages"
        )
      : path.join(resourcesPath, "python_env", "Lib", "site-packages")
    : null;

  console.log("resourcesPath", resourcesPath);

  if (sitePackagesDir) {
    console.log("sitePackagesDir", sitePackagesDir);

    if (
      await fs.stat(path.join(sitePackagesDir, "fastapi")).catch(() => false)
    ) {
      console.log("FastAPI is installed");
    } else {
      console.log("FastAPI is not installed");
      await installRequirements();
    }
  }

  mainWindow.webContents.send("boot-message", "Initializing NodeTool");
  if (pythonEnvExists) {
    console.log("Using conda env");
    // this is the case when the app is run from a built state
    env.PYTHONPATH = path.join(resourcesPath, "src");

    // set PATH for ffmpeg and ffprobe
    if (process.platform === "darwin") {
      env.PATH = `${resourcesPath}:${env.PATH}`;
    } else {
      env.PATH = `${resourcesPath};${env.PATH}`;
    }
    webDir = path.join(resourcesPath, "web");
  } else {
    // this is the case when the app is run from source
    env.PYTHONPATH = path.join("..", "src");
    webDir = path.join("..", "web", "dist");
  }

  try {
    runNodeTool(env);
  } catch (error) {
    console.error("Error starting server", error);
  }

  // ollamaProcess = spawn(
  //   path.join(resourcesPath, "ollama", "ollama.exe"),
  //   ["serve"],
  // );

  // ollamaProcess.stdout.on("data", (data) => {
  //   console.log(data.toString());
  // });

  // ollamaProcess.stderr.on("data", (data) => {
  //   console.log(data.toString());
  // });
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
