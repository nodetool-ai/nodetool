import { lstat, readlink, realpath } from "node:fs/promises";
import { dirname, extname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PATH_PROPERTIES = new Set(["path", "file_path", "folder_path", "folder", "directory", "input_path", "output_path"]);
const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "folder", "model3d", "model_3d"]);
const NAME_WRITERS = new Set(["nodetool.text.SaveTextFile", "nodetool.text.SaveText", "nodetool.image.SaveImage", "nodetool.audio.SaveAudio", "nodetool.video.SaveVideo", "nodetool.model3d.SaveModel3D"]);
const FILENAME_WRITERS = new Set(["nodetool.document.SaveDocumentFile", "nodetool.image.SaveImageFile", "nodetool.audio.SaveAudioFile", "nodetool.video.SaveVideoFile", "nodetool.model3d.SaveModel3DFile"]);
const FALLBACK_FILENAMES = {
  "nodetool.document.SaveDocumentFile": "document.txt",
  "nodetool.audio.SaveAudioFile": "audio.wav",
  "nodetool.video.SaveVideoFile": "video.mp4",
  "nodetool.image.SaveImageFile": "image_%Y-%m-%d_%H-%M-%S",
  "nodetool.model3d.SaveModel3DFile": "model_%Y-%m-%d_%H-%M-%S"
};

function datedName(name) {
  const now = new Date();
  const fields = { Y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), H: now.getHours(), M: now.getMinutes(), S: now.getSeconds() };
  return name.replace(/%([YmdHMS])/g, (_, field) => String(fields[field]).padStart(field === "Y" ? 4 : 2, "0"));
}

async function existingPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    try {
      if ((await lstat(path)).isSymbolicLink()) return existingPath(resolve(dirname(path), await readlink(path)));
    } catch (missing) {
      if (missing.code !== "ENOENT") throw missing;
    }
    const parent = dirname(path);
    if (parent === path) throw error;
    return resolve(await existingPath(parent), path.slice(parent.length + 1));
  }
}

export function createNodeInputBoundary(roots) {
  const base = resolve(roots[0]);
  async function localPath(value) {
    if (value === null || value === undefined || value === "") return base;
    if (typeof value !== "string") {
      if (typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid node input path");
      const result = { ...value };
      if (Object.hasOwn(result, "path")) result.path = await localPath(result.path);
      result.uri = typeof result.uri === "string" && result.uri !== "" ? result.uri : pathToFileURL(base).href;
      return result;
    }
    const path = /^file:/i.test(value) ? fileURLToPath(value) : isAbsolute(value) ? value : resolve(base, value);
    const actual = await existingPath(path);
    const allowed = await Promise.all(roots.map(existingPath));
    if (!allowed.some((root) => actual === root || actual.startsWith(root + sep))) {
      throw new Error("Node input path leaves this application's storage");
    }
    return actual;
  }
  async function media(value) {
    if (Array.isArray(value)) return Promise.all(value.map(media));
    if (value === null || typeof value !== "object" || value instanceof Uint8Array) return value;
    const entries = await Promise.all(Object.entries(value).map(async ([key, entry]) => [key,
      key === "uri" && typeof entry === "string" && !/^(https?:|data:|asset:|package:|memory:)/i.test(entry)
        ? entry === "" ? "" : pathToFileURL(await localPath(entry)).href
        : await media(entry)
    ]));
    return Object.fromEntries(entries);
  }
  return async (inputs, metadata) => {
    const writer = NAME_WRITERS.has(metadata?.node_type) || FILENAME_WRITERS.has(metadata?.node_type);
    const defaults = Object.fromEntries((metadata?.properties ?? []).filter((property) => property.default !== undefined && (PATH_PROPERTIES.has(property.name) || MEDIA_TYPES.has(property.type?.type) || writer && ["name", "filename", "save_to_workspace"].includes(property.name))).map((property) => [property.name, property.default]));
    const result = await media({ ...defaults, ...inputs });
    async function typed(value, type) {
      if (type?.type === "list" && Array.isArray(value)) return Promise.all(value.map((item) => typed(item, type.type_args?.[0])));
      if (type?.type === "folder") return localPath(value);
      if (MEDIA_TYPES.has(type?.type) && typeof value === "string" && !/^(https?:|data:|asset:|package:|memory:)/i.test(value)) return value === "" ? "" : pathToFileURL(await localPath(value)).href;
      return value;
    }
    for (const property of metadata?.properties ?? []) {
      if (!Object.hasOwn(result, property.name)) continue;
      if (writer && property.name === "folder" && result.save_to_workspace === true) {
        result.folder = base;
        continue;
      }
      if (PATH_PROPERTIES.has(property.name) || ["file_path", "folder_path"].includes(property.json_schema_extra?.type)) {
        result[property.name] = await localPath(result[property.name]);
      } else result[property.name] = await typed(result[property.name], property.type);
    }
    if (writer) {
      const folder = result.save_to_workspace === true ? base : typeof result.folder === "string" ? result.folder : result.folder?.path ?? result.folder?.uri ?? base;
      const destination = /^file:/i.test(folder) ? fileURLToPath(folder) : folder;
      const key = NAME_WRITERS.has(metadata.node_type) ? "name" : "filename";
      const rawName = (result[key] == null ? "" : String(result[key])).trim() || FALLBACK_FILENAMES[metadata.node_type] || "";
      const name = datedName(rawName);
      if (name.trim() !== "") {
        const writableRoot = await existingPath(base);
        const names = [...new Set([rawName, name])];
        if (!extname(name) && metadata.node_type === "nodetool.image.SaveImageFile") names.push(...["png", "jpg", "webp", "gif", "bmp"].map((extension) => `${name}.${extension}`));
        if (!extname(name) && metadata.node_type === "nodetool.model3d.SaveModel3DFile") names.push(`${name}.${String(result.model?.format || extname(result.model?.uri ?? "").slice(1) || "glb").toLowerCase()}`);
        for (const filename of names) {
          const target = await localPath(resolve(destination || base, filename));
          if (target !== writableRoot && !target.startsWith(writableRoot + sep)) throw new Error("Node output path leaves this application's storage");
        }
      }
      if (metadata.node_type === "nodetool.document.SaveDocumentFile" && result.path) {
        result.path = await localPath(result.path);
        const writableRoot = await existingPath(base);
        if (typeof result.path !== "string" || result.path !== writableRoot && !result.path.startsWith(writableRoot + sep)) throw new Error("Node output path leaves this application's storage");
      }
    }
    return result;
  };
}

export function guardExecutor(executor, metadata, boundary, properties = {}) {
  return new Proxy(executor, {
    get(target, key) {
      const method = Reflect.get(target, key);
      if (key === "initialize") return async () => {
        const guarded = await boundary(properties, metadata);
        target.applyProperties?.(guarded);
        await method?.call(target);
      };
      if (typeof method !== "function") return method;
      if (key === "process") return async (inputs, ...args) => method.call(target, await boundary(inputs, metadata), ...args);
      if (key === "genProcess") return async function* (inputs, ...args) {
        yield* method.call(target, await boundary(inputs, metadata), ...args);
      };
      return method.bind(target);
    }
  });
}
