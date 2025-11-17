const https = require("https");
const http = require("http");
const fs = require("fs");
const path = require("path");

const PLATFORMS = {
  "win32-x64": {
    url: "https://github.com/mamba-org/micromamba-releases/releases/download/2.3.3-0/micromamba-win-64.exe",
    binaryName: "micromamba.exe",
    outputDir: "win-64",
    outputPath: "Library/bin/micromamba.exe",
  },
  "darwin-arm64": {
    url: "https://github.com/mamba-org/micromamba-releases/releases/download/2.3.3-0/micromamba-osx-arm64",
    binaryName: "micromamba",
    outputDir: "osx-arm64",
    outputPath: "bin/micromamba",
  },
  "darwin-x64": {
    url: "https://github.com/mamba-org/micromamba-releases/releases/download/2.3.3-0/micromamba-osx-64",
    binaryName: "micromamba",
    outputDir: "osx-64",
    outputPath: "bin/micromamba",
  },
  "linux-x64": {
    url: "https://github.com/mamba-org/micromamba-releases/releases/download/2.3.3-0/micromamba-linux-64",
    binaryName: "micromamba",
    outputDir: "linux-64",
    outputPath: "bin/micromamba",
  },
  "linux-arm64": {
    url: "https://github.com/mamba-org/micromamba-releases/releases/download/2.3.3-0/micromamba-linux-aarch64",
    binaryName: "micromamba",
    outputDir: "linux-aarch64",
    outputPath: "bin/micromamba",
  },
};

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

async function downloadMicromamba(platform, config) {
  const resourcesDir = path.join(__dirname, "..", "resources", "micromamba", config.outputDir);
  const finalPath = path.join(resourcesDir, config.outputPath);
  
  // Create directory structure
  await fs.promises.mkdir(path.dirname(finalPath), { recursive: true });

  try {
    console.log(`\n📦 Downloading micromamba for ${platform}...`);
    console.log(`   URL: ${config.url}`);
    console.log(`   Destination: ${finalPath}`);
    
    await downloadFile(config.url, finalPath);

    const stats = fs.statSync(finalPath);
    console.log(`✓ Downloaded ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Verify download
    if (!fs.existsSync(finalPath)) {
      throw new Error(`Binary not found at ${finalPath} after download`);
    }

    // Make executable on Unix systems
    if (process.platform !== "win32") {
      fs.chmodSync(finalPath, 0o755);
      console.log(`✓ Made executable`);
    }

    console.log(`✅ Successfully downloaded micromamba for ${platform}\n`);
  } catch (error) {
    console.error(`❌ Failed to download micromamba for ${platform}:`, error.message);
    // Cleanup on error
    if (fs.existsSync(finalPath)) {
      try {
        fs.unlinkSync(finalPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

async function main() {
  const buildPlatform = process.env.BUILD_PLATFORM || `${process.platform}-${process.arch}`;
  
  // Download for all platforms or just the current build platform
  const platformsToDownload = process.env.DOWNLOAD_ALL_PLATFORMS === "true" 
    ? Object.keys(PLATFORMS)
    : [buildPlatform];

  console.log(`🚀 Downloading micromamba binaries...`);
  console.log(`   Platform: ${buildPlatform}`);
  console.log(`   Download all: ${process.env.DOWNLOAD_ALL_PLATFORMS === "true" ? "Yes" : "No"}\n`);

  const errors = [];
  for (const platform of platformsToDownload) {
    const config = PLATFORMS[platform];
    if (!config) {
      console.warn(`⚠️  Skipping unknown platform: ${platform}`);
      continue;
    }

    try {
      await downloadMicromamba(platform, config);
    } catch (error) {
      errors.push({ platform, error: error.message });
    }
  }

  if (errors.length > 0) {
    console.error("\n❌ Some downloads failed:");
    errors.forEach(({ platform, error }) => {
      console.error(`   ${platform}: ${error}`);
    });
    process.exit(1);
    return;
  }

  console.log("✅ All micromamba binaries downloaded successfully!");
  // Explicitly exit to ensure the process terminates
  process.exit(0);
}

main().catch((error) => {
  console.error("❌ Fatal error:", error);
  process.exit(1);
});
