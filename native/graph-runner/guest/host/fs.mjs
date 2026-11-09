// node:fs and node:fs/promises for the guest, on the `files` host capability
// (src/host/files.cpp). Node code reaches only the directories the embedder
// grants: the workspace (read-write, also the working directory for
// relative paths) and the read roots. Anything else fails with EACCES, as a
// Node fs error with `code`, `syscall` and `path`.
//
// Covered: readFile, writeFile, appendFile, stat, lstat, readdir (with
// withFileTypes), mkdir, mkdtemp, rm, rmdir, unlink, rename, copyFile, realpath,
// access and exists, as promises and *Sync. The promise open API provides
// read-only FileHandles. Streams, callback file descriptors, watchers and links
// are not implemented.
//
// The *Sync functions and the callback API stay synchronous on the worker.
// During a run, the promise API uses the host's asynchronous functions, which
// run on the I/O lane and settle as macrotasks. Outside a run, where no lane
// is bound, it falls back to the synchronous functions. A FileHandle opened
// during a run reads in call order on the lane, and close waits for the
// reads before it. One opened outside a run reads on the worker.

import { fileURLToPath } from "./url.mjs";

const files = () => {
  const f = globalThis.__host?.files;
  if (!f) throw new Error("guest: the files host capability is not installed");
  return f;
};

const ERROR = /^(E[A-Z]+): (.*?), (\w+) '(.*)'(?: \((.*)\))?$/s;

/** A host error as Node raises it: Error with code, syscall and path. */
function fsError(err) {
  const message = err instanceof Error ? err.message : String(err);
  const m = ERROR.exec(message);
  if (!m) return err instanceof Error ? err : new Error(message);
  const out = new Error(message);
  out.code = m[1];
  out.syscall = m[3];
  out.path = m[4];
  out.errno = -(
    {
      ENOENT: 2,
      EBADF: 9,
      EMFILE: 24,
      EACCES: 13,
      EBUSY: 16,
      EEXIST: 17,
      ENOTDIR: 20,
      EISDIR: 21,
      EINVAL: 22,
      ENOTEMPTY: 39
    }[m[1]] ?? 5
  );
  return out;
}

function call(fn) {
  try {
    return fn();
  } catch (err) {
    throw fsError(err);
  }
}

/** Awaits a host promise, turning its rejection into a Node fs error. */
async function callAsync(fn) {
  try {
    return await fn();
  } catch (err) {
    throw fsError(err);
  }
}

/** Whether a run is bound, so the asynchronous host functions can run. */
const bound = () => !!globalThis.__host?.files?.bound?.();

function toPath(path) {
  if (typeof path === "string") return path;
  if (path && typeof path === "object" && typeof path.href === "string")
    return fileURLToPath(path);
  if (path instanceof Uint8Array) return new TextDecoder().decode(path);
  const err = new TypeError(
    `The "path" argument must be of type string. Received ${path === null ? "null" : typeof path}`
  );
  err.code = "ERR_INVALID_ARG_TYPE";
  throw err;
}

function encodingOf(options) {
  if (typeof options === "string") return options;
  return options?.encoding ?? null;
}

function asBytes(data, encoding) {
  if (typeof data === "string") {
    if (encoding === "base64")
      return Uint8Array.fromBase64
        ? Uint8Array.fromBase64(data)
        : bytesFromBinary(atob(data));
    return new TextEncoder().encode(data);
  }
  if (data instanceof Uint8Array) return data;
  if (ArrayBuffer.isView(data))
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  if (data instanceof ArrayBuffer) return new Uint8Array(data);
  return new TextEncoder().encode(String(data));
}

function bytesFromBinary(binary) {
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function decodeBytes(bytes, encoding) {
  if (!encoding) {
    const B = globalThis.Buffer;
    return typeof B === "function"
      ? B.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      : bytes;
  }
  const e = String(encoding).toLowerCase();
  if (e === "base64")
    return bytes.toBase64
      ? bytes.toBase64()
      : btoa(String.fromCharCode(...bytes));
  if (e === "latin1" || e === "binary") {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return s;
  }
  return new TextDecoder().decode(bytes);
}

class Stats {
  constructor(info) {
    this._kind = info.kind;
    this.size = info.size;
    this.mode = info.mode;
    this.mtimeMs = info.mtimeMs;
    this.ctimeMs = info.ctimeMs;
    this.birthtimeMs = info.birthtimeMs;
    this.atimeMs = info.mtimeMs;
    this.mtime = new Date(info.mtimeMs);
    this.ctime = new Date(info.ctimeMs);
    this.birthtime = new Date(info.birthtimeMs);
    this.atime = new Date(info.mtimeMs);
  }
  isFile() {
    return this._kind === "file";
  }
  isDirectory() {
    return this._kind === "directory";
  }
  isSymbolicLink() {
    return this._kind === "symlink";
  }
  isFIFO() {
    return false;
  }
  isSocket() {
    return false;
  }
  isBlockDevice() {
    return false;
  }
  isCharacterDevice() {
    return false;
  }
}

class Dirent {
  constructor(name, kind, parentPath) {
    this.name = name;
    this._kind = kind;
    this.parentPath = parentPath;
    this.path = parentPath;
  }
  isFile() {
    return this._kind === "file";
  }
  isDirectory() {
    return this._kind === "directory";
  }
  isSymbolicLink() {
    return this._kind === "symlink";
  }
  isFIFO() {
    return false;
  }
  isSocket() {
    return false;
  }
  isBlockDevice() {
    return false;
  }
  isCharacterDevice() {
    return false;
  }
}

export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2
};

export function readFileSync(path, options) {
  const bytes = call(() => files().readFile(toPath(path)));
  return decodeBytes(bytes, encodingOf(options));
}

export function writeFileSync(path, data, options) {
  const flag =
    typeof options === "object" && options ? options.flag : undefined;
  call(() =>
    files().writeFile(
      toPath(path),
      asBytes(data, encodingOf(options)),
      flag === "a"
    )
  );
}

export function appendFileSync(path, data, options) {
  call(() =>
    files().writeFile(toPath(path), asBytes(data, encodingOf(options)), true)
  );
}

export function statSync(path, options) {
  try {
    return new Stats(JSON.parse(call(() => files().stat(toPath(path), true))));
  } catch (err) {
    if (options?.throwIfNoEntry === false && err.code === "ENOENT")
      return undefined;
    throw err;
  }
}

export function lstatSync(path, options) {
  try {
    return new Stats(JSON.parse(call(() => files().stat(toPath(path), false))));
  } catch (err) {
    if (options?.throwIfNoEntry === false && err.code === "ENOENT")
      return undefined;
    throw err;
  }
}

export function existsSync(path) {
  try {
    files().stat(toPath(path), true);
    return true;
  } catch {
    return false;
  }
}

export function accessSync(path) {
  call(() => files().stat(toPath(path), true));
}

function listDir(dir, options, prefix = "") {
  const entries = JSON.parse(call(() => files().readdir(dir)));
  const out = [];
  for (const [name, kind] of entries) {
    const rel = prefix ? `${prefix}/${name}` : name;
    out.push(
      options?.withFileTypes
        ? new Dirent(name, kind, prefix ? `${dir}/${prefix}` : dir)
        : rel
    );
    if (options?.recursive && kind === "directory")
      out.push(...listDir(`${dir}/${name}`, options, rel));
  }
  return out;
}

export function readdirSync(path, options) {
  return listDir(toPath(path), typeof options === "string" ? {} : options);
}

export function mkdirSync(path, options) {
  const recursive =
    typeof options === "object" && options ? !!options.recursive : false;
  return call(() => files().mkdir(toPath(path), recursive));
}

export function mkdtempSync(prefix, options) {
  const path = toPath(prefix);
  const created = call(() => files().mkdtemp(path));
  const result = path + created.slice(-6);
  return encodingOf(options) === "buffer"
    ? decodeBytes(asBytes(result), null)
    : result;
}

export function rmSync(path, options) {
  call(() => files().rm(toPath(path), !!options?.recursive, !!options?.force));
}

export function rmdirSync(path, options) {
  if (options?.recursive) return rmSync(path, { recursive: true });
  call(() => files().rmdir(toPath(path)));
}

export function unlinkSync(path) {
  call(() => files().unlink(toPath(path)));
}

export function renameSync(from, to) {
  call(() => files().rename(toPath(from), toPath(to)));
}

export function copyFileSync(from, to) {
  call(() => files().copyFile(toPath(from), toPath(to)));
}

export function realpathSync(path) {
  return call(() => files().realpath(toPath(path)));
}

/** The promise form: `hosted` during a run, the synchronous form otherwise. */
const promised =
  (hosted, sync) =>
  async (...args) =>
    bound() ? hosted(...args) : sync(...args);

async function readFileHosted(path, options) {
  const bytes = await callAsync(() => files().readFileAsync(toPath(path)));
  return decodeBytes(bytes, encodingOf(options));
}

async function writeFileHosted(path, data, options) {
  const flag =
    typeof options === "object" && options ? options.flag : undefined;
  await callAsync(() =>
    files().writeFileAsync(
      toPath(path),
      asBytes(data, encodingOf(options)),
      flag === "a"
    )
  );
}

async function appendFileHosted(path, data, options) {
  await callAsync(() =>
    files().writeFileAsync(toPath(path), asBytes(data, encodingOf(options)), true)
  );
}

async function statHosted(path, options, follow = true) {
  try {
    return new Stats(
      JSON.parse(await callAsync(() => files().statAsync(toPath(path), follow)))
    );
  } catch (err) {
    if (options?.throwIfNoEntry === false && err.code === "ENOENT")
      return undefined;
    throw err;
  }
}

async function listDirHosted(dir, options, prefix = "") {
  const entries = JSON.parse(await callAsync(() => files().readdirAsync(dir)));
  const out = [];
  for (const [name, kind] of entries) {
    const rel = prefix ? `${prefix}/${name}` : name;
    out.push(
      options?.withFileTypes
        ? new Dirent(name, kind, prefix ? `${dir}/${prefix}` : dir)
        : rel
    );
    if (options?.recursive && kind === "directory")
      out.push(...(await listDirHosted(`${dir}/${name}`, options, rel)));
  }
  return out;
}

async function mkdtempHosted(prefix, options) {
  const path = toPath(prefix);
  const created = await callAsync(() => files().mkdtempAsync(path));
  const result = path + created.slice(-6);
  return encodingOf(options) === "buffer"
    ? decodeBytes(asBytes(result), null)
    : result;
}

async function rmHosted(path, options) {
  await callAsync(() =>
    files().rmAsync(toPath(path), !!options?.recursive, !!options?.force)
  );
}

const MAX_HANDLE_READ_BYTES = 16 * 1024 * 1024;
function readInteger(value, name) {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError(`${name} must be a nonnegative safe integer`);
  return value;
}

class ReadFileHandle {
  #token;
  // Opened during a run: the host's asynchronous handle functions.
  #hosted;
  constructor(token, hosted) {
    this.#token = token;
    this.#hosted = hosted;
  }
  async read(buffer, offset = 0, length = undefined, position = null) {
    if (!ArrayBuffer.isView(buffer))
      throw new TypeError("buffer must be a Buffer or typed array view");
    readInteger(offset, "offset");
    if (length === undefined) length = buffer.byteLength - offset;
    readInteger(length, "length");
    if (offset > buffer.byteLength || length > buffer.byteLength - offset)
      throw new RangeError("read exceeds buffer view bounds");
    if (length > MAX_HANDLE_READ_BYTES)
      throw new RangeError("file read length exceeds 16 MiB limit");
    if (position !== null) readInteger(position, "position");
    const token = this.#token;
    const bytes = this.#hosted
      ? await callAsync(() => files().readHandleAsync(token, length, position))
      : call(() => files().readHandle(token, length, position));
    new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength).set(
      bytes,
      offset
    );
    return { bytesRead: bytes.byteLength, buffer };
  }
  async close() {
    const token = this.#token;
    if (this.#hosted) await callAsync(() => files().closeHandleAsync(token));
    else call(() => files().closeHandle(token));
  }
}

async function openReadFile(path, flags = "r") {
  if (flags !== "r")
    throw new TypeError("FileHandle open supports only read-only flags 'r'");
  if (!bound())
    return new ReadFileHandle(
      call(() => files().openRead(toPath(path), flags)),
      false
    );
  return new ReadFileHandle(
    await callAsync(() => files().openReadAsync(toPath(path), flags)),
    true
  );
}

export const promises = {
  open: openReadFile,
  readFile: promised(readFileHosted, readFileSync),
  writeFile: promised(writeFileHosted, writeFileSync),
  appendFile: promised(appendFileHosted, appendFileSync),
  stat: promised(statHosted, statSync),
  lstat: promised((path, options) => statHosted(path, options, false), lstatSync),
  readdir: promised(
    (path, options) =>
      listDirHosted(toPath(path), typeof options === "string" ? {} : options),
    readdirSync
  ),
  mkdir: promised(async (path, options) => {
    const recursive =
      typeof options === "object" && options ? !!options.recursive : false;
    return callAsync(() => files().mkdirAsync(toPath(path), recursive));
  }, mkdirSync),
  mkdtemp: promised(mkdtempHosted, mkdtempSync),
  rm: promised(rmHosted, rmSync),
  rmdir: promised(async (path, options) => {
    if (options?.recursive) return rmHosted(path, { recursive: true });
    await callAsync(() => files().rmdirAsync(toPath(path)));
  }, rmdirSync),
  unlink: promised(async (path) => {
    await callAsync(() => files().unlinkAsync(toPath(path)));
  }, unlinkSync),
  rename: promised(async (from, to) => {
    await callAsync(() => files().renameAsync(toPath(from), toPath(to)));
  }, renameSync),
  copyFile: promised(async (from, to) => {
    await callAsync(() => files().copyFileAsync(toPath(from), toPath(to)));
  }, copyFileSync),
  realpath: promised(
    (path) => callAsync(() => files().realpathAsync(toPath(path))),
    realpathSync
  ),
  access: promised(async (path) => {
    await callAsync(() => files().statAsync(toPath(path), true));
  }, accessSync),
  constants
};

const callback =
  (fn) =>
  (...args) => {
    const cb = args.pop();
    let result;
    try {
      result = fn(...args);
    } catch (err) {
      queueMicrotask(() => cb(err));
      return;
    }
    queueMicrotask(() => cb(null, result));
  };

const fs = {
  constants,
  promises,
  readFileSync,
  writeFileSync,
  appendFileSync,
  statSync,
  lstatSync,
  existsSync,
  accessSync,
  readdirSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  rmdirSync,
  unlinkSync,
  renameSync,
  copyFileSync,
  realpathSync,
  readFile: callback(readFileSync),
  writeFile: callback(writeFileSync),
  stat: callback(statSync),
  readdir: callback(readdirSync),
  mkdir: callback(mkdirSync),
  mkdtemp: callback(mkdtempSync),
  unlink: callback(unlinkSync),
  Stats,
  Dirent
};

export const readFile = fs.readFile;
export const writeFile = fs.writeFile;
export const stat = fs.stat;
export const readdir = fs.readdir;
export const mkdir = fs.mkdir;
export const mkdtemp = fs.mkdtemp;
export const unlink = fs.unlink;
export { Stats, Dirent };
export default fs;
