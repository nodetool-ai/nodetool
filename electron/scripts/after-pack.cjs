const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const os = require("os");
const https = require("https");
const { pipeline } = require("stream/promises");
const tar = require("tar-fs");
const gunzip = require("gunzip-maybe");

const MICROMAMBA_API_BASE = "https://micro.mamba.pm/api/micromamba";
const MICROMAMBA_DIR_NAME = "micromamba";
const MICROMAMBA_BINARY_NAME = {
  win32: "micromamba.exe",
  default: "micromamba",
};

const ARCH_MAPPING = {
  0: "x64",
  1: "ia32",
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

function resolveMicromambaTarget(platform, arch) {
  const archName = getArchName(arch);

  if (platform === "darwin") {
    if (archName === "arm64") {
      return "osx-arm64";
    }
    if (archName === "x64") {
      return "osx-64";
    }
    return null;
  }

  if (platform === "linux") {
    if (archName === "x64") {
      return "linux-64";
    }
    if (archName === "arm64") {
      return "linux-aarch64";
    }
    return null;
  }

  if (platform === "win32") {
    if (archName === "x64") {
      return "win-64";
    }
    return null;
  }

  return null;
}

function downloadFile(url, destinationPath) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, (response) => {
      if (
        response.statusCode &&
        response.statusCode >= 300 &&
        response.statusCode < 400 &&
        response.headers.location
      ) {
        const redirectUrl = new URL(response.headers.location, url).toString();
        response.destroy();
        downloadFile(redirectUrl, destinationPath).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(
          new Error(
            `Failed to download micromamba (status ${response.statusCode})`
          )
        );
        response.resume();
        return;
      }

      const fileStream = fs.createWriteStream(destinationPath);
      pipeline(response, fileStream)
        .then(resolve)
        .catch((error) => reject(error));
    });

    request.on("error", (error) => {
      reject(error);
    });
  });
}

async function extractArchive(archivePath, destinationDir) {
  await fsp.mkdir(destinationDir, { recursive: true });
  const extractStream = tar.extract(destinationDir);
  await pipeline(fs.createReadStream(archivePath), gunzip(), extractStream);
}

async function findBinary(startDir, binaryName) {
  const stack = [startDir];

  while (stack.length > 0) {
    const currentDir = stack.pop();
    if (!currentDir) {
      continue;
    }

    const entries = await fsp.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name === binaryName) {
        return fullPath;
      }
    }
  }

  return null;
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
  const target = resolveMicromambaTarget(electronPlatformName, arch);

  if (!target) {
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
    )} from ${MICROMAMBA_API_BASE}/${target}/latest`
  );

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), "micromamba-build-"));
  const archivePath = path.join(tempDir, "micromamba.tar.bz2");
  const extractDir = path.join(tempDir, "extracted");

  try {
    await downloadFile(
      `${MICROMAMBA_API_BASE}/${target}/latest`,
      archivePath
    );
    await extractArchive(archivePath, extractDir);

    const binaryPath = await findBinary(extractDir, binaryName);
    if (!binaryPath) {
      throw new Error("Micromamba binary not found after extraction");
    }

    await fsp.mkdir(micromambaDir, { recursive: true });
    await fsp.copyFile(binaryPath, targetPath);

    if (electronPlatformName !== "win32") {
      await fsp.chmod(targetPath, 0o755);
    }

    console.info(`micromamba bundled to ${targetPath}`);
  } finally {
    await fsp.rm(tempDir, { recursive: true, force: true });
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
