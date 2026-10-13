import { realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const PATH_PROPERTIES = new Set(["path", "file_path", "folder_path", "folder", "directory", "filename", "input_path", "output_path"]);
const MEDIA_TYPES = new Set(["image", "audio", "video", "document", "folder", "model3d", "model_3d"]);

async function existingPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
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
    const defaults = Object.fromEntries((metadata?.properties ?? []).filter((property) => property.default !== undefined && (PATH_PROPERTIES.has(property.name) || MEDIA_TYPES.has(property.type?.type))).map((property) => [property.name, property.default]));
    const result = await media({ ...defaults, ...inputs });
    async function typed(value, type) {
      if (type?.type === "list" && Array.isArray(value)) return Promise.all(value.map((item) => typed(item, type.type_args?.[0])));
      if (type?.type === "folder") return localPath(value);
      if (MEDIA_TYPES.has(type?.type) && typeof value === "string" && !/^(https?:|data:|asset:|package:|memory:)/i.test(value)) return value === "" ? "" : pathToFileURL(await localPath(value)).href;
      return value;
    }
    for (const property of metadata?.properties ?? []) {
      if (!Object.hasOwn(result, property.name)) continue;
      if (PATH_PROPERTIES.has(property.name) || ["file_path", "folder_path"].includes(property.json_schema_extra?.type)) {
        result[property.name] = await localPath(result[property.name]);
      } else result[property.name] = await typed(result[property.name], property.type);
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
