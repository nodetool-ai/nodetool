import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

export function readBuildCache(build) {
  const file = join(build, "CMakeCache.txt");
  if (!existsSync(file)) {
    return {};
  }
  return Object.fromEntries(readFileSync(file, "utf8").split(/\r?\n/)
    .flatMap((line) => {
      const match = /^([^/#][^:]*):[^=]+=(.*)$/.exec(line);
      return match ? [[match[1], match[2]]] : [];
    }));
}

export function editorBinary(build, configuration = "Release") {
  return [join(build, configuration, "nodetool-node-editor.exe"),
    join(build, "nodetool-node-editor"), join(build, "nodetool-node-editor.exe"),
    join(build, "nodetool-node-editor.app/Contents/MacOS/nodetool-node-editor")].find(existsSync);
}

export function windowsRuntimeDirectories(cache) {
  const prefixes = (cache.CMAKE_PREFIX_PATH ?? "").split(";").filter(Boolean);
  const media = (cache.GR_MEDIA_LIBRARY_DIRS ?? "").split(";").filter(Boolean);
  // The runner's FFmpeg first: Qt's bin holds FFmpeg DLLs with the same names.
  return [...media.map((lib) => join(dirname(lib), "bin")),
    ...prefixes.map((prefix) => join(prefix, "bin"))].filter(existsSync);
}

export function windowsPluginDirectories(cache) {
  return (cache.CMAKE_PREFIX_PATH ?? "").split(";").filter(Boolean)
    .map(prefix => join(prefix, "plugins")).filter(existsSync);
}
