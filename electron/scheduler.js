const { app } = require("electron");
const path = require("path");
const fs = require("fs").promises;
const { logMessage } = require("./logger");
const { shell } = require("electron");

const LAUNCH_AGENT_DIR = path.join(app.getPath("home"), "Library/LaunchAgents");
const AGENT_LABEL = "ai.nodetool.workflow";

/**
 * Gets the log file path for a workflow's launch agent
 * @param {string} workflowId - The workflow ID
 * @returns {string} The path to the log file
 */
function getLaunchAgentLogPath(workflowId) {
  return path.join(app.getPath("home"), "Library/Logs/nodetool", workflowId);
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

  const plistContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>${AGENT_LABEL}.${workflowId}</string>
    <key>ProgramArguments</key>
    <array>
        <string>${pythonPath}</string>
        <string>-m</string>
        <string>nodetool.cli</string>
        <string>run</string>
        <string>${workflowId}</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PYTHONPATH</key>
        <string>${srcPath}</string>
    </dict>
    <key>StartInterval</key>
    <integer>${intervalMinutes * 60}</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${getLaunchAgentLogPath(workflowId)}.out</string>
    <key>StandardErrorPath</key>
    <string>${getLaunchAgentLogPath(workflowId)}.err</string>
</dict>
</plist>`;

  const plistPath = path.join(
    LAUNCH_AGENT_DIR,
    `${AGENT_LABEL}.${workflowId}.plist`
  );

  try {
    await fs.mkdir(LAUNCH_AGENT_DIR, { recursive: true });
    await fs.writeFile(plistPath, plistContent);
    logMessage(`Created launch agent at ${plistPath}`);

    // Load the launch agent
    const { exec } = require("child_process");
    exec(`launchctl load ${plistPath}`, (error) => {
      if (error) {
        logMessage(`Error loading launch agent: ${error.message}`, "error");
      } else {
        logMessage("Launch agent loaded successfully");
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
    exec(`launchctl unload ${plistPath}`, async (error) => {
      if (error) {
        logMessage(`Error unloading launch agent: ${error.message}`, "error");
      } else {
        try {
          await fs.unlink(plistPath);
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

module.exports = {
  createLaunchAgent,
  removeLaunchAgent,
  getLaunchAgentLogPath,
};
