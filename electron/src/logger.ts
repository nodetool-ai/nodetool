import { app } from "electron";
import path from "path";
import log from "electron-log";
import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs";
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

// Persistent write stream for logging
let logStream: WriteStream | null = null;

/**
 * Gets or creates the log file write stream
 */
function getLogStream(): WriteStream | null {
  if (logStream && !logStream.destroyed) {
    return logStream;
  }
  
  try {
    // Ensure the log directory exists
    const logDir = path.dirname(LOG_FILE);
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
    
    // Create append stream with auto-flush
    logStream = createWriteStream(LOG_FILE, { flags: 'a' });
    logStream.on('error', (err) => {
      console.error('Log stream error:', err);
      logStream = null;
    });
    
    return logStream;
  } catch (err) {
    console.error('Failed to create log stream:', err);
    return null;
  }
}

/**
 * Logs a message to the console and the log file
 * @param message - The message to log
 * @param level - The log level (default: "info")
 */
export function logMessage(
  message: string,
  level: LogLevel = "info"
): void {
  const trimmedMessage = message.trim();
  
  try {
    // Log to electron-log (console + internal)
    log[level](trimmedMessage);
    
    // Write to file using persistent stream
    const stream = getLogStream();
    if (stream) {
      stream.write(trimmedMessage + "\n");
    }
  } catch (error) {
    console.error(`Error in log function: ${(error as Error).message}`);
  }
}

/**
 * Close the log stream (call on app quit)
 */
export function closeLogStream(): void {
  if (logStream && !logStream.destroyed) {
    logStream.end();
    logStream = null;
  }
}
