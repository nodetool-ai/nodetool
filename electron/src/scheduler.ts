import { app, shell } from "electron";
import * as path from "path";
import { promises as fsPromises } from "fs";
import { logMessage } from "./logger";
import { exec } from "child_process";
import { getPythonPath, srcPath } from "./config";

const { chmod, stat } = fsPromises;

const LAUNCH_AGENT_DIR: string = path.join(
  app.getPath("home"),
  "Library/LaunchAgents"
);
const AGENT_LABEL: string = "ai.nodetool.workflow";

/**
 * Gets list of currently scheduled workflows
 * @returns {Promise<Array<string>>}
 */
async function getScheduledWorkflows(): Promise<string[]> {
  return new Promise((resolve) => {
    exec("launchctl list", (error: Error | null, stdout: string) => {
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
        .filter((item): item is string => Boolean(item));

      resolve(scheduledWorkflows);
    });
  });
}

/**
 * Gets the log file path for a workflow's launch agent
 * @param {string} workflowId - The workflow ID
 * @returns {Promise<string>} The path to the log file
 */
async function getLaunchAgentLogPath(workflowId: string): Promise<string> {
  const logDir: string = path.join(
    app.getPath("home"),
    "Library/Logs/nodetool"
  );

  try {
    await fsPromises.mkdir(logDir, { recursive: true, mode: 0o755 });
    await ensureDirectoryPermissions(logDir);

    const workflowLogPath: string = path.join(logDir, workflowId);
    return workflowLogPath;
  } catch (err) {
    logMessage(
      `Failed to setup log directory: ${(err as Error).message}`,
      "error"
    );
    throw err;
  }
}

/**
 * Creates a launch agent plist file for macOS
 * @param {string} workflowId - The workflow ID to schedule
 * @param {number} intervalMinutes - Interval in minutes
 * @returns {Promise<void>}
 */
async function createLaunchAgent(
  workflowId: string,
  intervalMinutes: number
): Promise<void> {
  const pythonPath: string = getPythonPath();
  const binPath: string = path.dirname(pythonPath);
  const logPath: string = await getLaunchAgentLogPath(workflowId);

  const plistContent: string = `<?xml version="1.0" encoding="UTF-8"?>
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

  const plistPath: string = path.join(
    LAUNCH_AGENT_DIR,
    `${AGENT_LABEL}.${workflowId}.plist`
  );

  try {
    await fsPromises.mkdir(LAUNCH_AGENT_DIR, { recursive: true });
    await fsPromises.writeFile(plistPath, plistContent);
    logMessage(`Created launch agent at ${plistPath}`);

    exec(
      `launchctl load ${plistPath}`,
      (error: Error | null, stdout: string, stderr: string) => {
        if (error) {
          logMessage(`Error loading launch agent: ${error.message}`, "error");
          if (stdout) logMessage(`launchctl stdout: ${stdout}`, "error");
          if (stderr) logMessage(`launchctl stderr: ${stderr}`, "error");
        } else {
          logMessage("Launch agent loaded successfully");
          if (stdout) logMessage(`launchctl stdout: ${stdout}`, "error");
        }
      }
    );
  } catch (error) {
    logMessage(
      `Error creating launch agent: ${(error as Error).message}`,
      "error"
    );
    throw error;
  }
}

/**
 * Removes an existing launch agent
 * @param {string} workflowId - The workflow ID to unschedule
 * @returns {Promise<void>}
 */
async function removeLaunchAgent(workflowId: string): Promise<void> {
  const plistPath: string = path.join(
    LAUNCH_AGENT_DIR,
    `${AGENT_LABEL}.${workflowId}.plist`
  );

  try {
    exec(
      `launchctl unload ${plistPath}`,
      async (error: Error | null, stdout: string, stderr: string) => {
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
              `Error removing launch agent file: ${
                (unlinkError as Error).message
              }`,
              "error"
            );
          }
        }
      }
    );
  } catch (error) {
    logMessage(
      `Error removing launch agent: ${(error as Error).message}`,
      "error"
    );
    throw error;
  }
}

async function ensureDirectoryPermissions(dirPath: string): Promise<void> {
  try {
    const stats = await stat(dirPath);
    const currentMode = stats.mode & 0o777;
    const desiredMode = 0o755;

    if (currentMode !== desiredMode) {
      await chmod(dirPath, desiredMode);
      logMessage(`Updated permissions for ${dirPath} to 755`, "info");
    }
  } catch (err) {
    logMessage(
      `Error checking/setting permissions: ${(err as Error).message}`,
      "error"
    );
    throw err;
  }
}

export {
  createLaunchAgent,
  removeLaunchAgent,
  getLaunchAgentLogPath,
  getScheduledWorkflows,
};
