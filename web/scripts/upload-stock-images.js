#!/usr/bin/env node
/**
 * Script to upload stock images as assets to a running nodetool server.
 * Useful for generating better screenshots and demo content.
 *
 * Usage:
 *   node scripts/upload-stock-images.js [options]
 *
 * Options:
 *   --url <url>      Server URL (default: http://localhost:7777)
 *   --count <n>      Number of images to upload (default: 10)
 *   --width <w>      Image width (default: 800)
 *   --height <h>     Image height (default: 600)
 *   --folder <name>  Folder name for uploaded images (default: "Stock Images")
 *   --help           Show help
 *
 * Example:
 *   node scripts/upload-stock-images.js --url http://localhost:7777 --count 5
 */

import * as https from "https";
import * as http from "http";

/**
 * Parse command line arguments.
 * @returns {{ url: string, count: number, width: number, height: number, folderName: string }}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    url: "http://localhost:7777",
    count: 10,
    width: 800,
    height: 600,
    folderName: "Stock Images"
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--url":
        options.url = args[++i];
        break;
      case "--count":
        options.count = parseInt(args[++i], 10);
        break;
      case "--width":
        options.width = parseInt(args[++i], 10);
        break;
      case "--height":
        options.height = parseInt(args[++i], 10);
        break;
      case "--folder":
        options.folderName = args[++i];
        break;
      case "--help":
        console.log(`
Upload stock images as assets to a running nodetool server.

Usage:
  node scripts/upload-stock-images.js [options]

Options:
  --url <url>      Server URL (default: http://localhost:7777)
  --count <n>      Number of images to upload (default: 10)
  --width <w>      Image width (default: 800)
  --height <h>     Image height (default: 600)
  --folder <name>  Folder name for uploaded images (default: "Stock Images")
  --help           Show this help

Example:
  node scripts/upload-stock-images.js --url http://localhost:7777 --count 5
        `);
        process.exit(0);
    }
  }

  return options;
}

/**
 * Download an image from picsum.photos.
 * @param {number} width
 * @param {number} height
 * @param {number} id
 * @returns {Promise<{ buffer: Buffer, contentType: string }>}
 */
async function downloadImage(width, height, id) {
  const url = `https://picsum.photos/${width}/${height}?random=${id}`;

  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      // Handle redirects (picsum.photos redirects to actual image)
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const redirectUrl = response.headers.location;
        const protocol = redirectUrl.startsWith("https") ? https : http;
        protocol
          .get(redirectUrl, (redirectResponse) => {
            /** @type {Buffer[]} */
            const chunks = [];
            const contentType =
              redirectResponse.headers["content-type"] || "image/jpeg";

            redirectResponse.on("data", (/** @type {Buffer} */ chunk) => {
              chunks.push(chunk);
            });

            redirectResponse.on("end", () => {
              resolve({
                buffer: Buffer.concat(chunks),
                contentType
              });
            });

            redirectResponse.on("error", reject);
          })
          .on("error", reject);
      } else {
        /** @type {Buffer[]} */
        const chunks = [];
        const contentType = response.headers["content-type"] || "image/jpeg";

        response.on("data", (/** @type {Buffer} */ chunk) => {
          chunks.push(chunk);
        });

        response.on("end", () => {
          resolve({
            buffer: Buffer.concat(chunks),
            contentType
          });
        });

        response.on("error", reject);
      }
    });

    request.on("error", reject);
  });
}

/**
 * Create a folder in the asset store.
 * @param {string} baseUrl
 * @param {string} folderName
 * @returns {Promise<{ id: string, name: string, content_type: string } | null>}
 */
async function createFolder(baseUrl, folderName) {
  const url = new URL("/api/assets/", baseUrl);

  // Create form data
  const boundary = "----NodeToolBoundary" + Math.random().toString(36).slice(2);
  const payload = JSON.stringify({
    content_type: "folder",
    name: folderName,
    parent_id: null
  });

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="json"',
    "",
    payload,
    `--${boundary}--`
  ].join("\r\n");

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    /** @type {http.RequestOptions} */
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": Buffer.byteLength(body)
      }
    };

    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          // Folder might already exist, which is fine
          if (res.statusCode === 409) {
            console.log(`Folder "${folderName}" already exists, proceeding...`);
            resolve(null);
          } else {
            reject(
              new Error(`Failed to create folder: ${res.statusCode} - ${data}`)
            );
          }
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Upload an asset to the nodetool server.
 * @param {string} baseUrl
 * @param {Buffer} imageBuffer
 * @param {string} contentType
 * @param {string} filename
 * @param {string | undefined} parentId
 * @returns {Promise<{ id: string, name: string, content_type: string }>}
 */
async function uploadAsset(
  baseUrl,
  imageBuffer,
  contentType,
  filename,
  parentId
) {
  const url = new URL("/api/assets/", baseUrl);

  // Create multipart form data
  const boundary = "----NodeToolBoundary" + Math.random().toString(36).slice(2);

  const payloadJson = JSON.stringify({
    content_type: contentType,
    name: filename,
    parent_id: parentId || null
  });

  // Build multipart body
  /** @type {Buffer[]} */
  const parts = [];

  // JSON part
  parts.push(
    Buffer.from(
      [
        `--${boundary}`,
        'Content-Disposition: form-data; name="json"',
        "",
        payloadJson,
        ""
      ].join("\r\n")
    )
  );

  // File part
  parts.push(
    Buffer.from(
      [
        `--${boundary}`,
        `Content-Disposition: form-data; name="file"; filename="${filename}"`,
        `Content-Type: ${contentType}`,
        "",
        ""
      ].join("\r\n")
    )
  );
  parts.push(imageBuffer);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));

  const body = Buffer.concat(parts);

  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    /** @type {http.RequestOptions} */
    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
      path: parsedUrl.pathname,
      method: "POST",
      headers: {
        "Content-Type": `multipart/form-data; boundary=${boundary}`,
        "Content-Length": body.length
      }
    };

    const req = protocol.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch {
            reject(new Error(`Failed to parse response: ${data}`));
          }
        } else {
          reject(
            new Error(`Failed to upload asset: ${res.statusCode} - ${data}`)
          );
        }
      });
    });

    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

/**
 * Check if the server is healthy.
 * @param {string} baseUrl
 * @returns {Promise<boolean>}
 */
async function checkServerHealth(baseUrl) {
  return new Promise((resolve) => {
    const url = new URL("/health", baseUrl);
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;

    const req = protocol.get(
      {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === "https:" ? 443 : 80),
        path: parsedUrl.pathname,
        timeout: 5000
      },
      (res) => {
        resolve(res.statusCode === 200);
      }
    );

    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function main() {
  const options = parseArgs();

  console.log("🖼️  Stock Image Uploader for NodeTool");
  console.log("=====================================");
  console.log(`Server URL: ${options.url}`);
  console.log(`Images to upload: ${options.count}`);
  console.log(`Image dimensions: ${options.width}x${options.height}`);
  console.log(`Folder: ${options.folderName}`);
  console.log("");

  // Check server health
  console.log("Checking server connectivity...");
  const isHealthy = await checkServerHealth(options.url);
  if (!isHealthy) {
    console.error(
      `❌ Cannot connect to server at ${options.url}. Make sure the nodetool server is running.`
    );
    process.exit(1);
  }
  console.log("✅ Server is reachable\n");

  // Create folder for stock images
  /** @type {string | undefined} */
  let folderId;
  try {
    console.log(`Creating folder "${options.folderName}"...`);
    const folder = await createFolder(options.url, options.folderName);
    if (folder) {
      folderId = folder.id;
      console.log(`✅ Created folder with ID: ${folderId}\n`);
    } else {
      console.log("Using existing folder\n");
    }
  } catch (error) {
    console.warn(
      `⚠️  Could not create folder: ${error}. Images will be uploaded to root.\n`
    );
  }

  // Download and upload images
  const results = { success: 0, failed: 0 };

  for (let i = 1; i <= options.count; i++) {
    const filename = `stock-image-${i.toString().padStart(3, "0")}.jpg`;
    console.log(`[${i}/${options.count}] Processing ${filename}...`);

    try {
      // Download image from Picsum
      process.stdout.write("  📥 Downloading from picsum.photos... ");
      const { buffer, contentType } = await downloadImage(
        options.width,
        options.height,
        Date.now() + i
      );
      console.log(`done (${(buffer.length / 1024).toFixed(1)} KB)`);

      // Upload to nodetool
      process.stdout.write("  📤 Uploading to nodetool... ");
      const asset = await uploadAsset(
        options.url,
        buffer,
        contentType,
        filename,
        folderId
      );
      console.log(`done (ID: ${asset.id})`);

      results.success++;
    } catch (error) {
      console.error(`\n  ❌ Failed: ${error}`);
      results.failed++;
    }

    console.log("");
  }

  // Summary
  console.log("=====================================");
  console.log("📊 Summary");
  console.log(`   ✅ Successfully uploaded: ${results.success}`);
  if (results.failed > 0) {
    console.log(`   ❌ Failed: ${results.failed}`);
  }
  console.log("");

  if (results.success > 0) {
    console.log(
      "🎉 Done! The stock images are now available in your nodetool assets."
    );
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
