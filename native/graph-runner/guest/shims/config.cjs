// Shim for @nodetool-ai/config inside the QuickJS guest. CommonJS so that
// esbuild lets every named import through: a name the shim lacks reads as
// undefined, and only fails if a node calls it at run time. The node modules
// read IS_NODE and getNodeBuiltinSync at load time. Logging goes to the host.
//
// IS_NODE stays false, so Node-only branches stay off. getNodeBuiltinSync
// hands out the guest's own fs, path, os and url (guest/host/), which reach
// only what the host capabilities grant.
function write(level, name, message, fields) {
  const extra = fields === undefined ? "" : ` ${JSON.stringify(fields)}`;
  globalThis.__host?.log(level, `${name} | ${message}${extra}`);
}

function createLogger(name) {
  return {
    debug: () => {},
    info: (message, fields) => write("info", name, message, fields),
    warn: (message, fields) => write("warn", name, message, fields),
    error: (message, fields) => write("error", name, message, fields),
    child: () => createLogger(name)
  };
}

// The guest has no process environment unless the host provides one.
const guestEnv = () => globalThis.process?.env ?? {};

// Read by @nodetool-ai/models at load time (storage-maintenance.ts).
function isAutomaticStorageCleanupEnabled(env = guestEnv()) {
  const value = env.NODETOOL_STORAGE_AUTO_CLEANUP?.trim().toLowerCase();
  return value === "1" || value === "true";
}

// SQLite database paths, as in packages/config/src/paths.ts but inside the
// directory the host grants for database files (HostOptions::sqliteDirectory).
// Without a grant they are in-memory databases.
function sqlitePath(file) {
  const dir = globalThis.__host?.sqlite?.directory?.();
  return dir ? `${dir.replace(/\/+$/, "")}/${file}` : ":memory:";
}
const getDefaultDbPath = () => guestEnv().DB_PATH ?? sqlitePath("nodetool.sqlite3");
const getDefaultVectorstoreDbPath = () => guestEnv().VECTORSTORE_DB_PATH ?? sqlitePath("vectorstore.db");

const builtins = {
  fs: () => require("../host/fs.mjs").default,
  "fs/promises": () => require("../host/fs-promises.mjs").default,
  path: () => require("../host/path.mjs").default,
  os: () => require("../host/os.mjs").default,
  url: () => require("../host/url.mjs").default
};

function getNodeBuiltinSync(name) {
  const load = builtins[String(name).replace(/^node:/, "")];
  return load ? load() : null;
}

// As on a non-Node runtime: package assets a module reads at load time are
// inlined by guest/build.mjs instead (packageAssetPlugin).
function loadPackageAssetJson(ref) {
  throw new Error(`Package asset ${ref.pkg}/${ref.path} requested on a non-Node runtime.`);
}

// Hidden server imports stay unavailable unless explicitly registered by the guest host.
async function importHidden(specifier) {
  const load = globalThis.__guestImports?.[specifier];
  return typeof load === "function" ? await load() : null;
}

module.exports = {
  importHidden,
  importOptionalModule: importHidden,
  importNodeBuiltin: async (name) => getNodeBuiltinSync(name),
  getEnv: (key) => guestEnv()[key],
  IS_NODE: false,
  isAutomaticStorageCleanupEnabled,
  getDefaultDbPath,
  getDefaultVectorstoreDbPath,
  getNodeBuiltinSync,
  loadPackageAssetJson,
  safeProcessEnv: guestEnv,
  safeProcessPlatform: () => "",
  createLogger
};
