const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const https = require("https");
const http = require("http");

const MICROMAMBA_VERSION = "2.3.3-0";
const MICROMAMBA_BASE_URL = `https://github.com/mamba-org/micromamba-releases/releases/download/${MICROMAMBA_VERSION}`;
const MICROMAMBA_DIR_NAME = "micromamba";
const MICROMAMBA_BINARY_NAME = {
  win32: "micromamba.exe",
  default: "micromamba",
};

const ARCH_MAPPING = {
  0: "ia32",
  1: "x64",
  2: "armv7l",
  3: "arm64",
  4: "universal",
};

function getArchName(arch) {
  if (typeof arch === "string") {
    return arch;
  }
  return ARCH_MAPPING[arch] || "";
}

function resolveMicromambaUrl(platform, arch) {
  const archName = getArchName(arch);

  if (platform === "darwin") {
    if (archName === "arm64") {
      return `${MICROMAMBA_BASE_URL}/micromamba-osx-arm64`;
    }
    if (archName === "x64") {
      return `${MICROMAMBA_BASE_URL}/micromamba-osx-64`;
    }
    return null;
  }

  if (platform === "linux") {
    if (archName === "x64") {
      return `${MICROMAMBA_BASE_URL}/micromamba-linux-64`;
    }
    if (archName === "arm64") {
      return `${MICROMAMBA_BASE_URL}/micromamba-linux-aarch64`;
    }
    return null;
  }

  if (platform === "win32") {
    if (archName === "x64") {
      return `${MICROMAMBA_BASE_URL}/micromamba-win-64.exe`;
    }
    return null;
  }

  return null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    let currentUrl = url;
    let resolved = false;
    let req = null;
    
    const makeRequest = (requestUrl) => {
      // Resolve protocol-relative URLs (//example.com -> https://example.com)
      let absoluteUrl = requestUrl;
      if (requestUrl.startsWith("//")) {
        absoluteUrl = `https:${requestUrl}`;
      } else if (!requestUrl.startsWith("http://") && !requestUrl.startsWith("https://")) {
        // Resolve relative URLs
        try {
          absoluteUrl = new URL(requestUrl, currentUrl).href;
        } catch {
          absoluteUrl = `https://${requestUrl}`;
        }
      }
      
      const protocol = absoluteUrl.startsWith("https") ? https : http;
      
      // Destroy previous request if it exists (from redirect)
      if (req) {
        req.destroy();
      }
      
      req = protocol.get(absoluteUrl, (res) => {
        // Handle all redirect status codes: 301, 302, 307, 308
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Follow redirect - destroy current response
          res.destroy();
          currentUrl = absoluteUrl;
          return makeRequest(res.headers.location);
        }
        
        if (res.statusCode !== 200) {
          res.destroy();
          if (!resolved) {
            resolved = true;
            reject(new Error(`Failed to download: ${res.statusCode} ${res.statusMessage}`));
          }
          return;
        }
        
        // Collect all data chunks into a buffer
        const chunks = [];
        let totalLength = 0;
        
        res.on("data", (chunk) => {
          chunks.push(chunk);
          totalLength += chunk.length;
        });
        
        res.on("end", () => {
          if (resolved) return;
          
          // Write all data to file at once
          try {
            const buffer = Buffer.concat(chunks, totalLength);
            fs.writeFileSync(dest, buffer);
            resolved = true;
            // Destroy request and response to free resources
            res.destroy();
            if (req) {
              req.destroy();
            }
            resolve();
          } catch (err) {
            res.destroy();
            if (fs.existsSync(dest)) {
              fs.unlinkSync(dest);
            }
            resolved = true;
            reject(err);
          }
        });
        
        res.on("error", (err) => {
          res.destroy();
          if (!resolved) {
            resolved = true;
            reject(err);
          }
        });
      });
      
      req.on("error", (err) => {
        if (req) {
          req.destroy();
        }
        if (!resolved) {
          resolved = true;
          reject(err);
        }
      });
      
      // Set timeout (30 seconds)
      req.setTimeout(30000, () => {
        if (req) {
          req.destroy();
        }
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
        if (!resolved) {
          resolved = true;
          reject(new Error("Download timeout"));
        }
      });
    };
    
    makeRequest(url);
  });
}


function resolveResourcesDir(context) {
  const { electronPlatformName, appOutDir, packager } = context;
  if (electronPlatformName === "darwin") {
    const appName = `${packager.appInfo.productFilename}.app`;
    return path.join(appOutDir, appName, "Contents", "Resources");
  }

  return path.join(appOutDir, "resources");
}

async function ensureMicromambaBundled(context) {
  const { electronPlatformName, arch } = context;
  const downloadUrl = resolveMicromambaUrl(electronPlatformName, arch);

  if (!downloadUrl) {
    console.warn(
      `Skipping micromamba bundling for unsupported target ${electronPlatformName}-${getArchName(
        arch
      )}`
    );
    return;
  }

  const resourcesDir = resolveResourcesDir(context);
  const binaryName =
    MICROMAMBA_BINARY_NAME[electronPlatformName] ||
    MICROMAMBA_BINARY_NAME.default;
  const micromambaDir = path.join(resourcesDir, MICROMAMBA_DIR_NAME);
  const targetPath = path.join(micromambaDir, binaryName);

  try {
    await fsp.access(targetPath);
    console.info(`micromamba already bundled at ${targetPath}`);
    return;
  } catch {
    // Continue to download
  }

  console.info(
    `Bundling micromamba for ${electronPlatformName}-${getArchName(
      arch
    )} from ${downloadUrl}`
  );

  try {
    await fsp.mkdir(micromambaDir, { recursive: true });
    await downloadFile(downloadUrl, targetPath);

    if (electronPlatformName !== "win32") {
      await fsp.chmod(targetPath, 0o755);
    }

    console.info(`micromamba bundled to ${targetPath}`);
  } catch (error) {
    // Cleanup on error
    if (fs.existsSync(targetPath)) {
      try {
        await fsp.unlink(targetPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

module.exports = async function afterPack(context) {
  try {
    await ensureMicromambaBundled(context);
  } catch (error) {
    console.error("Failed to bundle micromamba", error);
    throw error;
  }
};
