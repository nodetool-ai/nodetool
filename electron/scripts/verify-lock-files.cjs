/**
 * Verify that all platform-specific conda lock files exist in electron/resources.
 * Fails the build if any are missing or lack required dependencies.
 */
const fs = require("fs");
const path = require("path");

const RESOURCES_DIR = path.join(__dirname, "..", "resources");

const LOCK_FILES = [
  "environment.lock.yml",
  "environment-osx-64.lock.yml",
  "environment-osx-arm64.lock.yml",
  "environment-linux-64.lock.yml",
  "environment-linux-aarch64.lock.yml",
  "environment-win-64.lock.yml",
];

const REQUIRED_DEPS = ["python", "uv"];

let failed = false;

for (const file of LOCK_FILES) {
  const filePath = path.join(RESOURCES_DIR, file);

  if (!fs.existsSync(filePath)) {
    console.error(`MISSING: ${file}`);
    failed = true;
    continue;
  }

  const content = fs.readFileSync(filePath, "utf8");
  for (const dep of REQUIRED_DEPS) {
    const pattern = new RegExp(`^\\s+- ${dep}([=>]|$)`, "m");
    if (!pattern.test(content)) {
      console.error(`INVALID: ${file} is missing required dependency '${dep}'`);
      failed = true;
    }
  }
}

if (failed) {
  console.error(
    "\nConda lock file validation failed. Regenerate with ./lock.sh"
  );
  process.exit(1);
}

console.log("Conda lock file validation passed.");
