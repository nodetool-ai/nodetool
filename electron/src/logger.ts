import { app } from "electron";
import path from "path";
import log from "electron-log";
import { promises as fs } from "fs";
import { emitServerLog } from "./events";

export type LogLevel = "info" | "warn" | "error";

export const LOG_FILE: string = path.join(
  app.getPath("userData"),
  "nodetool.log"
);

export async function logMessage(
  message: string,
  level: LogLevel = "info"
): Promise<void> {
  try {
    const timestamp = new Date().toISOString();
    const fullMessage = `[${timestamp}] [${level.toUpperCase()}] ${message.trim()}`;
    log[level](fullMessage);

    emitServerLog(message.trim());

    await fs.appendFile(LOG_FILE, fullMessage + "\n").catch((err) => {
      console.error("Failed to write to log file:", err);
    });
  } catch (error) {
    console.error(`Error in log function: ${(error as Error).message}`);
  }
}
