import path from "path";
import log from "electron-log";
import { createWriteStream, existsSync, mkdirSync, WriteStream } from "fs";
import { getSystemDataPath } from "./systemPaths";

/** The log level for the logger */
type LogLevel = "info" | "warn" | "error";

/**
 * The path to the log file
 * This matches Python's get_system_data_path("logs") / "nodetool.log"
 * to ensure logs are stored in the same location as the backend expects
 */
export const LOG_FILE: string = getSystemDataPath(path.join("logs", "nodetool.log"));

// Persistent write stream for logging
let logStream: WriteStream | null = null;

/** Gets or creates the log file write stream */
function getLogStream(): WriteStream | null {
  if (logStream && !logStream.destroyed) {
    return logStream;
  }
  
  try {
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

/** Logs a message to the console and the log file */
export function logMessage(
  message: string,
  level: LogLevel = "info"
): void {
  const trimmedMessage = message.trim();
  
  try {
    log[level](trimmedMessage);

    const stream = getLogStream();
    if (stream) {
      stream.write(trimmedMessage + "\n");
    }
  } catch (error) {
    console.error(`Error in log function: ${error instanceof Error ? error.message : String(error)}`);
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
