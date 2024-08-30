const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const tar = require("tar");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

const getPaths = (isProduction) => {
  const userDataPath = app.getPath("userData");
  const resourcesPath = process.resourcesPath;

  return {
    envDir: isProduction ? path.join(userDataPath, "python_env") : null,
    srcDir: isProduction ? path.join(userDataPath, "src") : "../src",
    webDir: isProduction ? path.join(userDataPath, "web") : "../web/dist",
    envTarPath: isProduction
      ? path.join(resourcesPath, "python_env.tar")
      : null,
    srcTarPath: isProduction ? path.join(resourcesPath, "nodetool.tar") : null,
    webTarPath: isProduction ? path.join(resourcesPath, "web.tar") : null,
    pythonExecutable: isProduction
      ? (process.platform === "win32"
          ? path.join(userDataPath, "python_env", "python.exe")
          : path.join(userDataPath, "python_env", "bin", "python"))
      : "python",
  };
};

const paths = getPaths(process.env.NODE_ENV === "production");

console.log("Paths:", paths);

async function untarFile(tarPath, destDir, progressCallback, useParentDir = true) {
  console.log(`Extracting ${tarPath} to ${destDir}...`);
  // Check if the destination directory already exists
  if (
    await fs
      .access(destDir)
      .then(() => true)
      .catch(() => false)
  ) {
    console.log(`Directory ${destDir} already exists. Skipping extraction.`);
    return false;
  }

  const stats = await fs.stat(tarPath);
  const totalSize = stats.size;
  let extractedSize = 0;
  const parentDir = path.dirname(destDir);

  await tar.x({
    file: tarPath,
    C: useParentDir ? parentDir : destDir,
    onentry: (entry) => {
      extractedSize += entry.size;
      const progress = Math.round((extractedSize / totalSize) * 100);
      progressCallback(progress, entry.path);
    },
  });

  return true;
}

async function runCondaUnpack(envDir) {
  // windows location is different
  const condaUnpack =
    process.platform === "win32"
      ? path.join(envDir, "Scripts", "conda-unpack.exe")
      : path.join(envDir, "bin", "conda-unpack");
  
  const condaUnpackProcess = spawn(condaUnpack, []);

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

async function setupEnvironment() {
  console.log("Resources path:", process.resourcesPath);

  console.log("Unpacking nodetool code...");
  mainWindow.webContents.send("boot-message", "Unpacking nodetool code...");
  await untarFile(paths.srcTarPath, paths.srcDir, (progress, path) => {
    mainWindow.webContents.send("extraction-progress", "nodetool", {
      progress,
      path,
      name: "nodetool",
    });
  });

  console.log("Unpacking web app...");
  mainWindow.webContents.send("boot-message", "Unpacking web app...");
  await untarFile(paths.webTarPath, paths.webDir, (progress, path) => {
    mainWindow.webContents.send("extraction-progress", {
      progress,
      path,
      name: "web",
    });
  });

  console.log("Setting up Python environment...");
  mainWindow.webContents.send(
    "boot-message",
    "Setting up Python environment..."
  );

  const envExtracted = await untarFile(
    paths.envTarPath,
    paths.envDir,
    (progress, path) => {
      mainWindow.webContents.send("extraction-progress", {
        progress,
        path,
        name: "python_env",
      });
    },
    false // Don't use parent directory for env extraction
  );
  if (envExtracted) {
    console.log("Environment unpacked successfully");
    mainWindow.webContents.send(
      "boot-message",
      "Environment unpacked successfully"
    );

    try {
      await runCondaUnpack(paths.envDir);
      mainWindow.webContents.send(
        "boot-message",
        "conda-unpack completed successfully"
      );
    } catch (error) {
      console.error("Error running conda-unpack:", error);
      mainWindow.webContents.send("boot-message", "Error running conda-unpack");
    }
  } else {
    console.log("Python environment already exists");
  }

  mainWindow.webContents.send(
    "boot-message",
    "Environment initialized successfully"
  );
}

module.exports = setupEnvironment;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
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

async function startServer() {
  if (process.env.NODE_ENV === "production") {
  await setupEnvironment();
  }
  mainWindow.webContents.send("setup-complete");

  const env = Object.create(process.env);
  env.PYTHONUNBUFFERED = "1";
  env.PYTHONPATH = paths.srcDir;

  mainWindow.webContents.send("boot-message", "Starting server...");

  serverProcess = spawn(
    paths.pythonExecutable,
    ["-m", "nodetool.cli", "serve", "--static-folder", paths.webDir],
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
