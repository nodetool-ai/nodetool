/**
 * PostgreSQL Server Management Module
 *
 * This module handles the lifecycle and management of a local PostgreSQL server.
 * It provides functionality for starting, stopping, and monitoring the PostgreSQL
 * server process, including database initialization, health checks, and port
 * availability verification.
 */

import { spawn, execSync } from "child_process";
import fs from "fs/promises";
import path from "path";
import net from "net";
import { logMessage } from "./logger";
import {
  getPostgresPath,
  getPgCtlPath,
  getInitDbPath,
  getPsqlPath,
  getPostgresDataPath,
  getProcessEnv,
  PID_DIRECTORY,
  getCondaEnvPath,
} from "./config";
import { emitServerLog } from "./events";
import { serverState } from "./state";
import { Watchdog } from "./watchdog";

const POSTGRES_PID_FILE_PATH = path.join(PID_DIRECTORY, "postgres.pid");
const DEFAULT_POSTGRES_PORT = 7778;
const POSTGRES_DATABASE = "nodetool";
const POSTGRES_USER = "nodetool";

let postgresWatchdog: Watchdog | null = null;

/**
 * Checks if a specific port is available for use
 * @param port - The port number to check
 * @returns Promise resolving to true if port is available, false otherwise
 */
async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net
      .createServer()
      .listen(port, "127.0.0.1")
      .once("listening", () => {
        server.close();
        resolve(true);
      })
      .once("error", () => resolve(false));
  });
}

/**
 * Finds the next available port starting from a base port
 * @param startPort - Port to start scanning from
 * @param maxIncrements - Maximum number of increments to try
 */
async function findAvailablePort(
  startPort: number,
  maxIncrements: number = 50
): Promise<number> {
  let candidate = startPort;
  for (let i = 0; i <= maxIncrements; i += 1) {
    const available = await isPortAvailable(candidate);
    if (available) return candidate;
    candidate += 1;
  }
  throw new Error(
    `No available port found from ${startPort} to ${startPort + maxIncrements}`
  );
}

/**
 * Checks if PostgreSQL is responsive on a specific port
 * @param port - The port to check
 * @param timeoutMs - The timeout in milliseconds
 * @returns True if PostgreSQL is responsive, false otherwise
 */
export async function isPostgresResponsive(
  port: number,
  timeoutMs = 2000
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once("timeout", () => {
      cleanup();
      resolve(false);
    });

    socket.once("error", () => {
      cleanup();
      resolve(false);
    });

    socket.once("connect", () => {
      cleanup();
      resolve(true);
    });

    socket.connect(port, "127.0.0.1");
  });
}

/**
 * Checks if the PostgreSQL data directory is initialized
 * @returns Promise<boolean> - true if initialized, false otherwise
 */
async function isDataDirectoryInitialized(): Promise<boolean> {
  const dataPath = getPostgresDataPath();
  try {
    const pgVersionPath = path.join(dataPath, "PG_VERSION");
    await fs.access(pgVersionPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Initializes the PostgreSQL data directory using initdb
 */
async function initializeDataDirectory(): Promise<void> {
  const dataPath = getPostgresDataPath();
  const initdbPath = getInitDbPath();
  const env = getProcessEnv();

  logMessage(`Initializing PostgreSQL data directory at ${dataPath}`);

  // Create the data directory if it doesn't exist
  await fs.mkdir(dataPath, { recursive: true });

  // Check if initdb exists
  try {
    await fs.access(initdbPath);
  } catch {
    throw new Error(`initdb not found at ${initdbPath}`);
  }

  return new Promise((resolve, reject) => {
    const args = [
      "-D",
      dataPath,
      "-U",
      POSTGRES_USER,
      "-E",
      "UTF8",
      "--no-locale",
      "-A",
      "trust",
    ];

    logMessage(`Running: ${initdbPath} ${args.join(" ")}`);

    const initdbProcess = spawn(initdbPath, args, {
      env: {
        ...env,
        // Ensure we use the conda environment's libraries
        LD_LIBRARY_PATH:
          process.platform !== "win32"
            ? path.join(getCondaEnvPath(), "lib")
            : undefined,
      },
      stdio: "pipe",
    });

    let stdout = "";
    let stderr = "";

    initdbProcess.stdout?.on("data", (data) => {
      stdout += data.toString();
      logMessage(`initdb stdout: ${data.toString().trim()}`);
    });

    initdbProcess.stderr?.on("data", (data) => {
      stderr += data.toString();
      logMessage(`initdb stderr: ${data.toString().trim()}`);
    });

    initdbProcess.on("close", (code) => {
      if (code === 0) {
        logMessage("PostgreSQL data directory initialized successfully");
        resolve();
      } else {
        reject(
          new Error(
            `initdb failed with code ${code}: ${stderr || stdout}`
          )
        );
      }
    });

    initdbProcess.on("error", (error) => {
      reject(new Error(`Failed to run initdb: ${error.message}`));
    });
  });
}

/**
 * Creates the nodetool database if it doesn't exist
 */
async function createDatabase(port: number): Promise<void> {
  const psqlPath = getPsqlPath();
  const env = getProcessEnv();

  logMessage(`Creating database '${POSTGRES_DATABASE}' if not exists`);

  return new Promise((resolve, reject) => {
    // First check if database exists
    const checkArgs = [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      POSTGRES_USER,
      "-d",
      "postgres",
      "-tAc",
      `SELECT 1 FROM pg_database WHERE datname='${POSTGRES_DATABASE}'`,
    ];

    const checkProcess = spawn(psqlPath, checkArgs, {
      env: {
        ...env,
        LD_LIBRARY_PATH:
          process.platform !== "win32"
            ? path.join(getCondaEnvPath(), "lib")
            : undefined,
      },
      stdio: "pipe",
    });

    let output = "";
    checkProcess.stdout?.on("data", (data) => {
      output += data.toString();
    });

    checkProcess.on("close", (code) => {
      if (output.trim() === "1") {
        logMessage(`Database '${POSTGRES_DATABASE}' already exists`);
        void enablePgVector(port).then(resolve).catch(reject);
        return;
      }

      // Create database
      const createArgs = [
        "-h",
        "127.0.0.1",
        "-p",
        String(port),
        "-U",
        POSTGRES_USER,
        "-d",
        "postgres",
        "-c",
        `CREATE DATABASE ${POSTGRES_DATABASE}`,
      ];

      const createProcess = spawn(psqlPath, createArgs, {
        env: {
          ...env,
          LD_LIBRARY_PATH:
            process.platform !== "win32"
              ? path.join(getCondaEnvPath(), "lib")
              : undefined,
        },
        stdio: "pipe",
      });

      createProcess.on("close", (createCode) => {
        if (createCode === 0) {
          logMessage(`Database '${POSTGRES_DATABASE}' created successfully`);
          void enablePgVector(port).then(resolve).catch(reject);
        } else {
          reject(
            new Error(`Failed to create database, exit code: ${createCode}`)
          );
        }
      });

      createProcess.on("error", (error) => {
        reject(new Error(`Failed to create database: ${error.message}`));
      });
    });

    checkProcess.on("error", (error) => {
      reject(new Error(`Failed to check database: ${error.message}`));
    });
  });
}

/**
 * Enables the pgvector extension in the nodetool database
 */
async function enablePgVector(port: number): Promise<void> {
  const psqlPath = getPsqlPath();
  const env = getProcessEnv();

  logMessage("Enabling pgvector extension");

  return new Promise((resolve, reject) => {
    const args = [
      "-h",
      "127.0.0.1",
      "-p",
      String(port),
      "-U",
      POSTGRES_USER,
      "-d",
      POSTGRES_DATABASE,
      "-c",
      "CREATE EXTENSION IF NOT EXISTS vector",
    ];

    const process_exec = spawn(psqlPath, args, {
      env: {
        ...env,
        LD_LIBRARY_PATH:
          process.platform !== "win32"
            ? path.join(getCondaEnvPath(), "lib")
            : undefined,
      },
      stdio: "pipe",
    });

    process_exec.on("close", (code) => {
      if (code === 0) {
        logMessage("pgvector extension enabled successfully");
        resolve();
      } else {
        // pgvector might not be available, log warning but don't fail
        logMessage(
          `Warning: Failed to enable pgvector extension (exit code ${code}). Vector features may not be available.`,
          "warn"
        );
        resolve();
      }
    });

    process_exec.on("error", (error) => {
      logMessage(
        `Warning: Failed to enable pgvector extension: ${error.message}`,
        "warn"
      );
      resolve();
    });
  });
}

/**
 * Starts the PostgreSQL server using Watchdog
 */
export async function startPostgresServer(): Promise<void> {
  const existingPort = DEFAULT_POSTGRES_PORT;

  // Check if an external PostgreSQL is already running
  if (await isPostgresResponsive(existingPort)) {
    serverState.postgresPort = existingPort;
    serverState.postgresExternalManaged = true;
    logMessage(`Detected running PostgreSQL instance on port ${existingPort}`);
    return;
  }

  // Check standard PostgreSQL port as well
  if (await isPostgresResponsive(5432)) {
    serverState.postgresPort = 5432;
    serverState.postgresExternalManaged = true;
    logMessage("Detected running PostgreSQL instance on default port 5432");
    return;
  }

  // Initialize data directory if needed
  if (!(await isDataDirectoryInitialized())) {
    logMessage("PostgreSQL data directory not initialized, initializing...");
    await initializeDataDirectory();
  }

  const basePort = serverState.postgresPort ?? DEFAULT_POSTGRES_PORT;
  const selectedPort = await findAvailablePort(basePort);
  serverState.postgresPort = selectedPort;
  serverState.postgresExternalManaged = false;

  const postgresPath = getPostgresPath();
  const dataPath = getPostgresDataPath();

  // Check if postgres executable exists
  try {
    await fs.access(postgresPath);
  } catch {
    logMessage(
      `PostgreSQL executable not found at ${postgresPath}. Skipping PostgreSQL startup.`,
      "warn"
    );
    return;
  }

  const args = [
    "-D",
    dataPath,
    "-p",
    String(selectedPort),
    "-h",
    "127.0.0.1",
  ];

  // Create env with proper library paths
  const env = getProcessEnv();
  const postgresEnv: NodeJS.ProcessEnv = {
    ...env,
    // Ensure PostgreSQL can find its libraries
    LD_LIBRARY_PATH:
      process.platform !== "win32"
        ? path.join(getCondaEnvPath(), "lib")
        : undefined,
  };

  postgresWatchdog = new Watchdog({
    name: "postgres",
    command: postgresPath,
    args,
    env: postgresEnv,
    pidFilePath: POSTGRES_PID_FILE_PATH,
    healthUrl: `http://127.0.0.1:${selectedPort}`, // TCP check will be used instead
    healthPort: selectedPort,
    healthHost: "127.0.0.1",
    onOutput: (line) => emitServerLog(line),
    logOutput: false,
  });

  try {
    await postgresWatchdog.start();
    logMessage(`PostgreSQL started on port ${selectedPort}`);

    // Create database and enable pgvector
    await createDatabase(selectedPort);
  } catch (error) {
    logMessage(
      `Failed to start PostgreSQL watchdog: ${(error as Error).message}`,
      "error"
    );
    postgresWatchdog = null;
    throw error;
  }
}

/**
 * Stops the PostgreSQL server gracefully
 */
export async function stopPostgresServer(): Promise<void> {
  if (postgresWatchdog) {
    logMessage("Stopping PostgreSQL server (watchdog)");
    await postgresWatchdog.stopGracefully();
    postgresWatchdog = null;
  }
}

/**
 * Checks if the PostgreSQL server is currently running
 * @returns true if PostgreSQL is running, false otherwise
 */
export function isPostgresRunning(): boolean {
  return postgresWatchdog !== null;
}

/**
 * Gets the PostgreSQL connection URL for the nodetool database
 * @returns The PostgreSQL connection URL
 */
export function getPostgresConnectionUrl(): string {
  const port = serverState.postgresPort ?? DEFAULT_POSTGRES_PORT;
  return `postgresql://${POSTGRES_USER}@127.0.0.1:${port}/${POSTGRES_DATABASE}`;
}

export { POSTGRES_DATABASE, POSTGRES_USER, DEFAULT_POSTGRES_PORT };
