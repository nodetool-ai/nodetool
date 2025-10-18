import { app } from "electron";
import path from "path";
import log from "electron-log";
import { promises as fs } from "fs";
import { emitServerLog } from "./events";
import { getSystemDataPath } from "./config";

/**
 * The log level for the logger
 */
export type LogLevel = "info" | "warn" | "error";

/**
 * The path to the log file
 * This matches Python's get_system_data_path("logs") / "nodetool.log"
 * to ensure logs are stored in the same location as the backend expects
 */
export const LOG_FILE: string = getSystemDataPath(path.join("logs", "nodetool.log"));

/**
 * Logs a message to the console and the log file
 * @param message - The message to log
 * @param level - The log level (default: "info")
 */
export async function logMessage(
  message: string,
  level: LogLevel = "info"
): Promise<void> {
  try {
    log[level](message.trim());

    emitServerLog(message.trim());

    // Ensure the log directory exists before writing
    const logDir = path.dirname(LOG_FILE);
    await fs.mkdir(logDir, { recursive: true }).catch((err) => {
      console.error("Failed to create log directory:", err);
    });

    await fs.appendFile(LOG_FILE, message.trim() + "\n").catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${(error as Error).message}`);
  }
}
