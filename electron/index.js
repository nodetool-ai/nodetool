const { app, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const tar = require("tar");
const { spawn } = require("child_process");

let mainWindow;
let serverProcess;

async function getFirstExistingPath(...paths) {
  for (const p of paths) {
    try {
      await fs.access(p);
      return p;
    } catch (error) {
      // Path doesn't exist, continue to next
    }
  }
  return null; // Return null if no paths exist
}

const getTarPaths = async () => {
  const resourcesPath = process.resourcesPath;
  const userDataPath = app.getPath("userData");
  return {
    envTarPath: path.join(resourcesPath, "python_env.tar"),
    srcTarPath: path.join(resourcesPath, "nodetool.tar"),
    webTarPath: path.join(resourcesPath, "web.tar"),
    srcDir: path.join(userDataPath, "src"),
    webDir: path.join(userDataPath, "web"),
    envDir: path.join(userDataPath, "python_env"),
  };
};

const getPaths = async () => {
  const userDataPath = app.getPath("userData");
  return {
    envDir: await getFirstExistingPath(path.join(userDataPath, "python_env")),
    srcDir: await getFirstExistingPath(
      path.join(userDataPath, "src"),
      "../src"
    ),
    webDir: await getFirstExistingPath(
      path.join(userDataPath, "web"),
      "../web/dist"
    ),
  };
};

async function untarFile(
  tarPath,
  destDir,
  progressCallback,
  useParentDir = true
) {
  console.log(`Extracting ${tarPath} to ${destDir}...`);
  mainWindow.webContents.send("boot-message", `Extracting ${tarPath} to ${destDir}...`);

  // Check if the tar file exists
  if (!(await fs.access(tarPath).catch(() => false))) {
    console.log(`File ${tarPath} does not exist.`);
    return false;
  }

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

async function setupEnvironment() {
  console.log("Resources path:", process.resourcesPath);

  const paths = await getTarPaths();

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

    mainWindow.webContents.send(
      "boot-message",
      "Environment initialized successfully"
    );
  }
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
  const userDataPath = app.getPath("userData");
  const paths = await getPaths();
  console.log("Paths:", paths);

  try {
    await setupEnvironment();
    mainWindow.webContents.send("setup-complete");
  } catch (error) {
    console.error("Setup failed:", error);
    mainWindow.webContents.send("boot-message", "Setup failed");
    return;
  }

  const env = Object.create(process.env);
  env.PYTHONUNBUFFERED = "1";
  env.PYTHONPATH = paths.srcDir;
  env.PATH = `${process.resourcesPath}${path.delimiter}${env.PATH}`;

  mainWindow.webContents.send("boot-message", "Starting server...");
  const pythonEnvExecutable = await getFirstExistingPath(
    process.platform === "win32"
      ? path.join(userDataPath, "python_env", "python.exe")
      : path.join(userDataPath, "python_env", "bin", "python")
  );

  serverProcess = spawn(
    pythonEnvExecutable ? pythonEnvExecutable : "python",
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
