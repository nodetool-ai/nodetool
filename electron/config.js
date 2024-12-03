const path = require("path");
const { app } = require("electron");

// Base paths
const resourcesPath = process.resourcesPath;
const srcPath = app.isPackaged
  ? path.join(resourcesPath, "src")
  : path.join(__dirname, "..", "src");


const userDataPath = app.getPath("userData");

// Python environment paths
const PYTHON_ENV = {
  condaEnvPath: path.join(userDataPath, "conda_env"),
  getRequirementsPath: () => {
    const userRequirements = path.join(userDataPath, "requirements.txt");
    const defaultRequirements = app.isPackaged
      ? path.join(resourcesPath, "requirements.txt")
      : path.join(__dirname, "..", "requirements.txt");
    
    try {
      // Synchronously check if user requirements exists
      require('fs').accessSync(userRequirements);
      return userRequirements;
    } catch {
      return defaultRequirements;
    }
  },

  getPythonPath: () =>
    process.platform === "win32"
      ? path.join(userDataPath, "conda_env", "python.exe")
      : path.join(userDataPath, "conda_env", "bin", "python"),

  getPipPath: () =>
    process.platform === "win32"
      ? path.join(userDataPath, "conda_env", "Scripts", "pip.exe")
      : path.join(userDataPath, "conda_env", "bin", "pip"),

  getCondaUnpackPath: () =>
    process.platform === "win32"
      ? path.join(userDataPath, "conda_env", "Scripts", "conda-unpack.exe")
      : path.join(userDataPath, "conda_env", "bin", "conda-unpack"),

  saveUserRequirements: (requirements) => {
    const fs = require('fs');
    try {
      fs.writeFileSync(path.join(userDataPath, "requirements.txt"), requirements);
      return true;
    } catch (error) {
      console.error("Failed to save user requirements:", error);
      return false;
    }
  },
};

// Environment variables
const getProcessEnv = () => ({
  ...process.env,
  PYTHONPATH: srcPath,
  PYTHONUNBUFFERED: "1",
  PYTHONNOUSERSITE: "1",
  PATH:
    process.platform === "win32"
      ? [
          path.join(PYTHON_ENV.condaEnvPath),
          path.join(PYTHON_ENV.condaEnvPath, "Library", "mingw-w64", "bin"),
          path.join(PYTHON_ENV.condaEnvPath, "Library", "usr", "bin"),
          path.join(PYTHON_ENV.condaEnvPath, "Library", "bin"),
          path.join(
            PYTHON_ENV.condaEnvPath,
            "Lib",
            "site-packages",
            "torch",
            "lib"
          ),
          path.join(PYTHON_ENV.condaEnvPath, "Scripts"),
          process.env.PATH,
        ].join(path.delimiter)
      : [
          path.join(PYTHON_ENV.condaEnvPath, "bin"),
          path.join(PYTHON_ENV.condaEnvPath, "lib"),
          process.env.PATH,
        ].join(path.delimiter),
});

module.exports = {
  PYTHON_ENV,
  getProcessEnv,
  srcPath,
};
