const { app } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const fsSync = require("fs");
const { logMessage } = require("./logger");
const { shell } = require("electron");
const { promises: fsPromises } = require("fs");
const { chmod, stat } = fsPromises;

const LAUNCH_AGENT_DIR = path.join(app.getPath("home"), "Library/LaunchAgents");
const AGENT_LABEL = "ai.nodetool.workflow";

/**
 * Gets list of currently scheduled workflows
 * @returns {Promise<Array<string>>}
 */
async function getScheduledWorkflows() {
  return new Promise((resolve) => {
    const { exec } = require("child_process");
    exec("launchctl list", (error, stdout) => {
      if (error) {
        logMessage(
          `Error getting scheduled workflows: ${error.message}`,
          "error"
        );
        resolve([]);
        return;
      }

      const scheduledWorkflows = stdout
        .split("\n")
        .filter((line) => line.includes(AGENT_LABEL))
        .map((line) => {
          const match = line.match(new RegExp(`${AGENT_LABEL}\\.(.*)`));
          return match ? match[1] : null;
        })
        .filter(Boolean);

      resolve(scheduledWorkflows);
    });
  });
}

/**
 * Gets the log file path for a workflow's launch agent
 * @param {string} workflowId - The workflow ID
 * @returns {Promise<string>} The path to the log file
 */
async function getLaunchAgentLogPath(workflowId) {
  const logDir = path.join(app.getPath("home"), "Library/Logs/nodetool");

  try {
    await fsPromises.mkdir(logDir, { recursive: true, mode: 0o755 });
    await ensureDirectoryPermissions(logDir);

    const workflowLogPath = path.join(logDir, workflowId);
    return workflowLogPath;
  } catch (err) {
    logMessage(`Failed to setup log directory: ${err.message}`, "error");
    throw err;
  }
}

/**
 * Creates a launch agent plist file for macOS
 * @param {string} workflowId - The workflow ID to schedule
 * @param {number} intervalMinutes - Interval in minutes
 * @returns {Promise<void>}
 */
async function createLaunchAgent(workflowId, intervalMinutes) {
  const { getPythonPath, srcPath } = require("./config");
  const pythonPath = getPythonPath();
  const binPath = path.dirname(pythonPath);
  const logPath = await getLaunchAgentLogPath(workflowId);

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${AGENT_LABEL}.${workflowId}</string>
    <key>ProgramArguments</key>
    <array>
        <string>python</string>
        <string>-m</string>
        <string>nodetool.cli</string>
        <string>run</string>
        <string>${workflowId}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONPATH</key>
        <string>${srcPath}</string>
        <key>PATH</key>
        <string>${binPath}:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
    </dict>
    <key>StartInterval</key>
    <integer>${intervalMinutes * 60}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logPath}.out</string>
    <key>StandardErrorPath</key>
    <string>${logPath}.err</string>
</dict>
</plist>`;

  const plistPath = path.join(
    LAUNCH_AGENT_DIR,
    `${AGENT_LABEL}.${workflowId}.plist`
  );

  try {
    await fsPromises.mkdir(LAUNCH_AGENT_DIR, { recursive: true });
    await fsPromises.writeFile(plistPath, plistContent);
    logMessage(`Created launch agent at ${plistPath}`);

    // Load the launch agent with output capture
    const { exec } = require("child_process");
    exec(`launchctl load ${plistPath}`, (error, stdout, stderr) => {
      if (error) {
        logMessage(`Error loading launch agent: ${error.message}`, "error");
        if (stdout) logMessage(`launchctl stdout: ${stdout}`, "error");
        if (stderr) logMessage(`launchctl stderr: ${stderr}`, "error");
      } else {
        logMessage("Launch agent loaded successfully");
        if (stdout) logMessage(`launchctl stdout: ${stdout}`, "error");
      }
    });
  } catch (error) {
    logMessage(`Error creating launch agent: ${error.message}`, "error");
    throw error;
  }
}

/**
 * Removes an existing launch agent
 * @param {string} workflowId - The workflow ID to unschedule
 * @returns {Promise<void>}
 */
async function removeLaunchAgent(workflowId) {
  const plistPath = path.join(
    LAUNCH_AGENT_DIR,
    `${AGENT_LABEL}.${workflowId}.plist`
  );

  try {
    // Unload the launch agent first
    const { exec } = require("child_process");
    exec(`launchctl unload ${plistPath}`, async (error, stdout, stderr) => {
      if (error) {
        logMessage(`Error unloading launch agent: ${error.message}`);
        if (stdout) logMessage(`launchctl stdout: ${stdout}`);
        if (stderr) logMessage(`launchctl stderr: ${stderr}`);
      } else {
        if (stdout) logMessage(`launchctl stdout: ${stdout}`);
        try {
          await fsPromises.unlink(plistPath);
          logMessage(`Removed launch agent at ${plistPath}`);
        } catch (unlinkError) {
          logMessage(
            `Error removing launch agent file: ${unlinkError.message}`,
            "error"
          );
        }
      }
    });
  } catch (error) {
    logMessage(`Error removing launch agent: ${error.message}`, "error");
    throw error;
  }
}

async function ensureDirectoryPermissions(dirPath) {
  try {
    // Check current permissions
    const stats = await stat(dirPath);
    const currentMode = stats.mode & 0o777; // Get only permission bits

    // We want 755 (rwxr-xr-x) for directories
    const desiredMode = 0o755;

    if (currentMode !== desiredMode) {
      await chmod(dirPath, desiredMode);
      logMessage(`Updated permissions for ${dirPath} to 755`, "info");
    }

    // Verify owner is current user
    if (stats.uid !== process.getuid()) {
      logMessage(`Warning: ${dirPath} is not owned by current user`, "warn");
    }
  } catch (err) {
    logMessage(`Error checking/setting permissions: ${err.message}`, "error");
    throw err;
  }
}

module.exports = {
  createLaunchAgent,
  removeLaunchAgent,
  getLaunchAgentLogPath,
  getScheduledWorkflows,
};
