/** Collect exact external install identities from the release's runtime table and shared tree. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { runReleaseCommand } from "./commands.mjs";

const PACKAGE_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const EXACT_VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export function validateInstallPin(pin) {
  const match = typeof pin.version === "string" && EXACT_VERSION.exec(pin.version);
  if (typeof pin.name !== "string" || !PACKAGE_NAME.test(pin.name) ||
      (pin.installName !== undefined && (typeof pin.installName !== "string" || !PACKAGE_NAME.test(pin.installName))) ||
      !match || match.slice(1, 4).some(part => !Number.isSafeInteger(Number(part))) ||
      (match[4] && match[4].split(".").some(part => /^\d+$/.test(part) && part.length > 1 && part.startsWith("0")))) {
    throw new Error(`Invalid exact install pin: ${pin.name}@${pin.version}`);
  }
  const digest = typeof pin.integrity === "string" && /^sha512-([A-Za-z0-9+/]+={0,2})$/.exec(pin.integrity);
  if (!digest || Buffer.from(digest[1], "base64").length !== 64 || Buffer.from(digest[1], "base64").toString("base64") !== digest[1]) {
    throw new Error(`Invalid sha512 integrity for ${pin.name}@${pin.version}`);
  }
  if (pin.shared !== undefined && typeof pin.shared !== "boolean") {
    throw new Error(`Invalid shared install pin: ${pin.name}`);
  }
  return pin;
}

export function runtimeInstallTargets(runtimePackages) {
  const targets = new Map();
  for (const runtime of Object.values(runtimePackages)) {
    if (runtime.npmPackages.length !== runtime.packageNames.length) {
      throw new Error("Runtime npm specs and package names differ");
    }
    for (let index = 0; index < runtime.npmPackages.length; index++) {
      const folder = runtime.packageNames[index];
      const spec = runtime.npmPackages[index];
      if (!PACKAGE_NAME.test(folder) || !spec.startsWith(`${folder}@`)) {
        throw new Error(`Invalid runtime npm install spec: ${spec}`);
      }
      const requested = spec.slice(folder.length + 1);
      const alias = requested.startsWith("npm:");
      const target = alias ? requested.slice(4) : `${folder}@${requested}`;
      const split = target.lastIndexOf("@");
      const pin = { name: target.slice(0, split), version: target.slice(split + 1) };
      if (alias && folder !== pin.name) { pin.installName = folder; }
      // Validate identity and exact version before issuing any registry command.
      validateInstallPin({ ...pin, integrity: `sha512-${Buffer.alloc(64).toString("base64")}` });
      const previous = targets.get(folder);
      if (previous && (previous.name !== pin.name || previous.version !== pin.version)) {
        throw new Error(`Conflicting runtime install target: ${folder}`);
      }
      targets.set(folder, pin);
    }
  }
  if (targets.size === 0) { throw new Error("Release runtime pin collection inspected no npm targets"); }
  return [...targets.values()];
}

export function readRegistryInstallMetadata(name, version, run = runReleaseCommand) {
  const metadata = JSON.parse(run("npm", ["view", `${name}@${version}`, "name", "version", "dist.integrity", "--json", "--registry=https://registry.npmjs.org"], {}));
  return { name: metadata.name, version: metadata.version, integrity: metadata["dist.integrity"] };
}

export async function collectReleaseInstallPins({
  root,
  runtimePackages,
  readRegistryMetadata = readRegistryInstallMetadata,
  readInstalledManifest = name => JSON.parse(readFileSync(join(root, "node_modules", name, "package.json"), "utf8"))
}) {
  const table = runtimePackages ?? (await import(pathToFileURL(join(root, "packages/protocol/dist/runtime-npm-packages.js")).href)).RUNTIME_NPM_PACKAGES;
  const targets = runtimeInstallTargets(table);
  for (const name of ["mediabunny", "@mediabunny/server"]) {
    const manifest = await readInstalledManifest(name);
    if (manifest.name !== name) { throw new Error(`Shared release package identity differs: ${name}`); }
    const target = { name, version: manifest.version, shared: true };
    validateInstallPin({ ...target, integrity: `sha512-${Buffer.alloc(64).toString("base64")}` });
    targets.push(target);
  }
  const pins = [];
  for (const target of targets) {
    const metadata = await readRegistryMetadata(target.name, target.version);
    if (metadata.name !== target.name || metadata.version !== target.version) {
      throw new Error(`Registry identity differs from ${target.name}@${target.version}`);
    }
    pins.push(validateInstallPin({ ...target, integrity: metadata.integrity }));
  }
  return pins;
}
