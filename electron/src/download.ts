import { promises as fs, constants, createWriteStream } from "fs";

import { logMessage } from "./logger";
import path from "path";
import { emitUpdateProgress } from "./events";
import { checkPermissions } from "./utils";
import * as https from "https";
import { IncomingMessage } from "http";

/**
 * Get file size from URL using HEAD request
 * @param url - The URL to get the file size from
 * @returns The file size
 */
async function getFileSizeFromUrl(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const request = https.request(url, { method: "HEAD" }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        getFileSizeFromUrl(response.headers.location!)
          .then(resolve)
          .catch(reject);
        return;
      }

      const contentLength = parseInt(
        response.headers["content-length"] || "0",
        10
      );
      if (!contentLength) {
        reject(new Error("Could not determine file size"));
        return;
      }

      logMessage(`File size: ${contentLength} bytes for ${url}`);
      resolve(contentLength);
    });

    request.on("error", reject);
    request.end();
  });
}

/**
 * Download a file's contents directly to a string
 * @param filePath - The path to the file to download
 * @returns The file contents
 */
async function downloadFromFile(filePath: string): Promise<string> {
  try {
    const data = await fs.readFile(filePath, "utf8");
    return data;
  } catch (error: any) {
    throw new Error(`Failed to read file ${filePath}: ${error.message}`);
  }
}

/**
 * Download a file from a URL with validation
 * @param url - The URL to download the file from
 * @param dest - The path to save the downloaded file
 */
async function downloadFile(url: string, dest: string): Promise<void> {
  logMessage(`Downloading file from ${url} to ${dest}`);

  const destDir = path.dirname(dest);
  const { accessible, error } = await checkPermissions(destDir, constants.W_OK);
  if (!accessible) {
    logMessage(`Cannot write to download directory: ${error}`, "error");
    throw new Error(`Cannot write to download directory: ${error}`);
  }

  let expectedSize: number;
  try {
    expectedSize = await getFileSizeFromUrl(url);
    logMessage(`Expected file size: ${expectedSize} bytes`);
  } catch (error: any) {
    logMessage(`Failed to get file size from URL: ${error.message}`, "error");
    throw new Error(`Failed to get file size from URL: ${error.message}`);
  }

  let existingFileStats;
  try {
    existingFileStats = await fs.stat(dest);
    if (existingFileStats.size === expectedSize) {
      logMessage("Existing file matches expected size, skipping download");
      return;
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") {
      logMessage(`Error checking existing file: ${err.message}`, "warn");
    }
  }

  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let downloadedBytes = 0;
    const startTime = Date.now();
    let lastUpdate = startTime;

    function calculateETA(): string {
      const elapsedSeconds = (Date.now() - startTime) / 1000;
      const bytesPerSecond = downloadedBytes / elapsedSeconds;
      const remainingBytes = expectedSize - downloadedBytes;
      const remainingSeconds = remainingBytes / bytesPerSecond;

      if (remainingSeconds < 60) {
        return `${Math.round(remainingSeconds)} seconds left`;
      } else if (remainingSeconds < 3600) {
        return `${Math.round(remainingSeconds / 60)} minutes left`;
      } else {
        return `${Math.round(remainingSeconds / 3600)} hours left`;
      }
    }

    const request = https.get(url, handleResponse);
    request.on("error", handleError);

    function handleResponse(response: IncomingMessage) {
      if (response.statusCode === 404) {
        logMessage(`File not found at ${url}`, "error");
        reject(new Error(`File not found at ${url}`));
        return;
      }

      if (response.statusCode === 302 || response.statusCode === 301) {
        logMessage(`Redirected to ${response.headers.location}`);
        https
          .get(response.headers.location!, handleResponse)
          .on("error", handleError);
        return;
      }

      const contentLength = parseInt(
        response.headers["content-length"] || "0",
        10
      );
      if (contentLength !== expectedSize) {
        logMessage(
          `Server file size mismatch. Expected: ${expectedSize}, Got: ${contentLength}`,
          "error"
        );
        reject(
          new Error(
            `Server file size mismatch. Expected: ${expectedSize}, Got: ${contentLength}`
          )
        );
        return;
      }

      response.on("data", (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        const progress = (downloadedBytes / expectedSize) * 100;
        const fileName = path.basename(dest).split(".")[0];

        const now = Date.now();
        if (now - lastUpdate >= 1000) {
          const eta = calculateETA();
          emitUpdateProgress(fileName, progress, "Downloading", eta);
          lastUpdate = now;
        }
      });

      response.pipe(file);

      file.on("finish", async () => {
        try {
          const stats = await fs.stat(dest);
          if (stats.size !== expectedSize) {
            await fs.unlink(dest);
            reject(
              new Error(
                `Downloaded file size mismatch. Expected: ${expectedSize}, Got: ${stats.size}`
              )
            );
            return;
          }
          logMessage(`Download completed and verified: ${dest}`);
          resolve();
        } catch (err: any) {
          reject(new Error(`Failed to verify downloaded file: ${err.message}`));
        }
      });
    }

    function handleError(err: Error) {
      logMessage(`Error downloading file: ${err.message}`, "error");
      file.close();
      fs.unlink(dest).then(() => {
        reject(new Error(`Error downloading file: ${err.message}`));
      });
    }
  });
}

export { downloadFile, getFileSizeFromUrl, downloadFromFile };
