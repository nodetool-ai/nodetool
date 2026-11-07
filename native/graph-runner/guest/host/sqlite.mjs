// Guest half of the `sqlite` capability (src/host/sqlite.cpp): the subset of
// the better-sqlite3 12 API that NodeTool code uses, on the runner's built-in
// SQLite. guest/build.mjs maps "better-sqlite3" onto this module.
//
// Database: constructor(filename, {readonly, fileMustExist, timeout,
// verbose}), prepare, exec, pragma (with {simple}), transaction (and its
// deferred, immediate and exclusive variants, nested through savepoints),
// loadExtension (the built-in sqlite-vec only), defaultSafeIntegers, close,
// and the name, open, inTransaction, readonly and memory properties.
// Statement: run, get, all, iterate, pluck, raw, expand, safeIntegers, bind,
// columns, and the reader, readonly, source, database and busy properties.
//
// Values bind and read back as in better-sqlite3: numbers bind as REAL,
// BigInts as INTEGER, typed arrays as BLOB. INTEGER columns read as numbers,
// or as BigInts in safe-integer mode. BLOBs read as Buffer when the guest has
// one, otherwise as Uint8Array. SQLite errors throw SqliteError with the
// result code name in `code`.
//
// Database files are allowed only inside the directory the embedder grants
// (HostOptions::sqliteDirectory). Without a grant, only ":memory:" opens.

const unavailable = (what) => new Error(`guest: better-sqlite3 ${what} is unavailable in the native runner`);

function host() {
  const sqlite = globalThis.__host?.sqlite;
  if (!sqlite) throw unavailable("(the host has no sqlite capability)");
  return sqlite;
}

export class SqliteError extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}
Object.defineProperty(SqliteError.prototype, "name", {
  value: "SqliteError",
  writable: true,
  enumerable: false,
  configurable: true
});

// The host prefixes each error message with the SQLite result code name or
// the JavaScript error type better-sqlite3 throws.
function translate(err) {
  const message = err instanceof Error ? err.message : String(err);
  let m = /^(SQLITE_[A-Z_]+|UNKNOWN_SQLITE_ERROR_\d+): ([\s\S]*)$/.exec(message);
  if (m) return new SqliteError(m[2], m[1]);
  m = /^(TypeError|RangeError): ([\s\S]*)$/.exec(message);
  if (m) return m[1] === "TypeError" ? new TypeError(m[2]) : new RangeError(m[2]);
  return err;
}

function call(name, ...args) {
  const sqlite = host();
  try {
    return sqlite[name](...args);
  } catch (err) {
    throw translate(err);
  }
}

// Statements free their SQLite handle and databases close when the guest
// collects them, as in better-sqlite3. Closing a database frees its
// statements.
const registry = (name) =>
  typeof FinalizationRegistry === "function"
    ? new FinalizationRegistry((id) => globalThis.__host?.sqlite?.[name](id))
    : null;
const statementFinalizer = registry("finalize");
const databaseFinalizer = registry("close");

function booleanOption(options, key) {
  if (!(key in options)) return false;
  const value = options[key];
  if (typeof value !== "boolean") throw new TypeError(`Expected the "${key}" option to be a boolean`);
  return value;
}

function isPlainObject(value) {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function encode(value) {
  if (typeof value === "number") return ["d", value];
  if (typeof value === "string") return ["s", value];
  if (typeof value === "bigint") return ["i", String(value)];
  if (value === null || value === undefined) return ["n", null];
  if (ArrayBuffer.isView(value)) {
    return ["b", new Uint8Array(value.buffer, value.byteOffset, value.byteLength)];
  }
  throw new TypeError("SQLite3 can only bind numbers, strings, bigints, buffers, and null");
}

function toBlob(bytes) {
  const B = globalThis.Buffer;
  return typeof B?.from === "function" ? B.from(bytes.buffer, bytes.byteOffset, bytes.byteLength) : bytes;
}

function defineCell(row, name, value) {
  Object.defineProperty(row, name, { value, writable: true, enumerable: true, configurable: true });
}

const cppdb = Symbol("cppdb");

export default class Database {
  constructor(filenameGiven, options) {
    if (filenameGiven != null && ArrayBuffer.isView(filenameGiven)) {
      throw unavailable("Database(buffer) (deserialize)");
    }
    if (filenameGiven == null) filenameGiven = "";
    if (options == null) options = {};
    if (typeof filenameGiven !== "string") throw new TypeError("Expected first argument to be a string");
    if (typeof options !== "object") throw new TypeError("Expected second argument to be an options object");
    if ("readOnly" in options) throw new TypeError('Misspelled option "readOnly" should be "readonly"');
    if ("memory" in options) {
      throw new TypeError('Option "memory" was removed in v7.0.0 (use ":memory:" filename instead)');
    }
    const filename = filenameGiven.trim();
    const anonymous = filename === "" || filename === ":memory:";
    const readonly = booleanOption(options, "readonly");
    const fileMustExist = booleanOption(options, "fileMustExist");
    const timeout = "timeout" in options ? options.timeout : 5000;
    const verbose = "verbose" in options ? options.verbose : null;
    if (readonly && anonymous) throw new TypeError("In-memory/temporary databases cannot be readonly");
    if (!Number.isInteger(timeout) || timeout < 0) {
      throw new TypeError('Expected the "timeout" option to be a positive integer');
    }
    if (timeout > 0x7fffffff) throw new RangeError('Option "timeout" cannot be greater than 2147483647');
    if (verbose != null && typeof verbose !== "function") {
      throw new TypeError('Expected the "verbose" option to be a function');
    }
    const id = call("open", filename, readonly, fileMustExist, timeout);
    Object.defineProperty(this, cppdb, {
      value: { id, name: filenameGiven, memory: anonymous, readonly, open: true, safe: false, verbose }
    });
    databaseFinalizer?.register(this, id, this[cppdb]);
  }

  get name() {
    return this[cppdb].name;
  }
  get open() {
    return this[cppdb].open;
  }
  get inTransaction() {
    const db = this[cppdb];
    return db.open && call("inTransaction", db.id);
  }
  get readonly() {
    return this[cppdb].readonly;
  }
  get memory() {
    return this[cppdb].memory;
  }

  prepare(sql) {
    return new Statement(this, sql, false);
  }

  exec(sql) {
    if (typeof sql !== "string") throw new TypeError("Expected first argument to be a string");
    const db = openDb(this);
    db.verbose?.(sql);
    call("exec", db.id, sql);
    return this;
  }

  pragma(source, options) {
    if (options == null) options = {};
    if (typeof source !== "string") throw new TypeError("Expected first argument to be a string");
    if (typeof options !== "object") throw new TypeError("Expected second argument to be an options object");
    const simple = booleanOption(options, "simple");
    const stmt = new Statement(this, `PRAGMA ${source}`, true);
    return simple ? stmt.pluck().get() : stmt.all();
  }

  transaction(fn) {
    if (typeof fn !== "function") throw new TypeError("Expected first argument to be a function");
    const controller = transactionController(this);
    const self = this;
    const properties = {
      default: { value: wrapTransaction(fn, self, controller.default) },
      deferred: { value: wrapTransaction(fn, self, controller.deferred) },
      immediate: { value: wrapTransaction(fn, self, controller.immediate) },
      exclusive: { value: wrapTransaction(fn, self, controller.exclusive) },
      database: { value: this, enumerable: true }
    };
    Object.defineProperties(properties.default.value, properties);
    Object.defineProperties(properties.deferred.value, properties);
    Object.defineProperties(properties.immediate.value, properties);
    Object.defineProperties(properties.exclusive.value, properties);
    return properties.default.value;
  }

  loadExtension(path) {
    if (typeof path !== "string") throw new TypeError("Expected first argument to be a string");
    call("loadExtension", openDb(this).id, path);
    return this;
  }

  defaultSafeIntegers(toggle = true) {
    if (typeof toggle !== "boolean") throw new TypeError("Expected first argument to be a boolean");
    this[cppdb].safe = toggle;
    return this;
  }

  close() {
    const db = this[cppdb];
    if (db.open) {
      call("close", db.id);
      db.open = false;
      databaseFinalizer?.unregister(db);
    }
    return this;
  }

  unsafeMode() {
    throw unavailable("Database.unsafeMode");
  }
  function() {
    throw unavailable("Database.function");
  }
  aggregate() {
    throw unavailable("Database.aggregate");
  }
  table() {
    throw unavailable("Database.table");
  }
  backup() {
    throw unavailable("Database.backup");
  }
  serialize() {
    throw unavailable("Database.serialize");
  }
}

Database.SqliteError = SqliteError;

function openDb(database) {
  const db = database[cppdb];
  if (!db.open) throw new TypeError("The database connection is not open");
  return db;
}

const controllers = new WeakMap();

function transactionController(database) {
  let controller = controllers.get(database);
  if (!controller) {
    const shared = {
      commit: new Statement(database, "COMMIT", false),
      rollback: new Statement(database, "ROLLBACK", false),
      savepoint: new Statement(database, "SAVEPOINT `\t_bs3.\t`", false),
      release: new Statement(database, "RELEASE `\t_bs3.\t`", false),
      rollbackTo: new Statement(database, "ROLLBACK TO `\t_bs3.\t`", false)
    };
    controller = {
      default: { begin: new Statement(database, "BEGIN", false), ...shared },
      deferred: { begin: new Statement(database, "BEGIN DEFERRED", false), ...shared },
      immediate: { begin: new Statement(database, "BEGIN IMMEDIATE", false), ...shared },
      exclusive: { begin: new Statement(database, "BEGIN EXCLUSIVE", false), ...shared }
    };
    controllers.set(database, controller);
  }
  return controller;
}

function wrapTransaction(fn, database, { begin, commit, rollback, savepoint, release, rollbackTo }) {
  return function sqliteTransaction(...args) {
    let before, after, undo;
    if (database.inTransaction) {
      before = savepoint;
      after = release;
      undo = rollbackTo;
    } else {
      before = begin;
      after = commit;
      undo = rollback;
    }
    before.run();
    try {
      const result = fn.apply(this, args);
      if (result && typeof result.then === "function") {
        throw new TypeError("Transaction function cannot return a promise");
      }
      after.run();
      return result;
    } catch (ex) {
      if (database.inTransaction) {
        undo.run();
        if (undo !== rollback) after.run();
      }
      throw ex;
    }
  };
}

class Statement {
  #db;
  #id;
  #params;
  #mode = "flat";
  #safe;
  #bound = null;

  constructor(database, source, pragma) {
    if (typeof source !== "string") throw new TypeError("Expected first argument to be a string");
    const db = openDb(database);
    const info = call("prepare", db.id, source, pragma);
    this.#db = db;
    this.#id = info.id;
    this.#params = info.params;
    this.#safe = db.safe;
    for (const [key, value] of [
      ["reader", info.reader],
      ["readonly", info.readonly],
      ["source", source],
      ["database", database]
    ]) {
      Object.defineProperty(this, key, { value, enumerable: true });
    }
    statementFinalizer?.register(this, info.id);
  }

  get busy() {
    return false;
  }

  run(...args) {
    const [values, kinds] = this.#bind(args);
    this.#db.verbose?.(this.source);
    return call("run", this.#id, values, kinds, this.#safe);
  }

  get(...args) {
    const rows = this.#query(args, 1);
    return rows.length === 0 ? undefined : rows[0];
  }

  all(...args) {
    return this.#query(args, 0);
  }

  *iterate(...args) {
    yield* this.#query(args, 0);
  }

  pluck(toggle = true) {
    return this.#setMode("pluck", toggle);
  }
  raw(toggle = true) {
    return this.#setMode("raw", toggle);
  }
  expand(toggle = true) {
    return this.#setMode("expand", toggle);
  }

  safeIntegers(toggle = true) {
    if (typeof toggle !== "boolean") throw new TypeError("Expected first argument to be a boolean");
    this.#safe = toggle;
    return this;
  }

  bind(...args) {
    if (this.#bound) throw new TypeError("The bind() method can only be invoked once per statement object");
    this.#bound = this.#encode(args);
    return this;
  }

  columns() {
    if (!this.reader) throw new TypeError("The columns() method is only for statements that return data");
    const flat = call("columns", this.#id);
    const out = [];
    for (let i = 0; i < flat.length; i += 5) {
      out.push({ name: flat[i], column: flat[i + 1], table: flat[i + 2], database: flat[i + 3], type: flat[i + 4] });
    }
    return out;
  }

  #setMode(mode, toggle) {
    if (!this.reader) throw new TypeError(`The ${mode}() method is only for statements that return data`);
    if (typeof toggle !== "boolean") throw new TypeError("Expected first argument to be a boolean");
    if (toggle) this.#mode = mode;
    else if (this.#mode === mode) this.#mode = "flat";
    return this;
  }

  #bind(args) {
    openDb(this.database);
    if (this.#bound) {
      if (args.length > 0) throw new TypeError("This statement already has bound parameters");
      return this.#bound;
    }
    return this.#encode(args);
  }

  // better-sqlite3's Binder: anonymous values from arguments and arrays,
  // named values from one plain object, matched by name without its prefix.
  #encode(args) {
    const params = this.#params;
    const n = params.length;
    const named = params.some((p) => p !== null);
    const values = new Array(n).fill(null);
    const kinds = new Array(n).fill("n");
    let anon = 0;
    let count = 0;
    let boundObject = false;
    const put = (index, value) => {
      if (index >= n) throw new RangeError("Too many parameter values were provided");
      const [kind, encoded] = encode(value);
      kinds[index] = kind;
      values[index] = encoded;
      count++;
    };
    const nextAnon = () => {
      while (anon < n && params[anon] !== null) anon++;
      return anon++;
    };
    for (const arg of args) {
      if (Array.isArray(arg)) {
        for (const value of arg) put(nextAnon(), value);
        continue;
      }
      if (arg !== null && typeof arg === "object" && !ArrayBuffer.isView(arg)) {
        if (isPlainObject(arg)) {
          if (boundObject) throw new TypeError("You cannot specify named parameters in two different objects");
          boundObject = true;
          for (let i = 0; i < n; i++) {
            if (params[i] === null) continue;
            const key = params[i].slice(1);
            if (!Object.prototype.hasOwnProperty.call(arg, key)) {
              throw new RangeError(`Missing named parameter "${key}"`);
            }
            put(i, arg[key]);
          }
          continue;
        }
        if (named) throw new TypeError("Named parameters can only be passed within plain objects");
      }
      put(nextAnon(), arg);
    }
    if (count < n) {
      if (!boundObject && named) throw new TypeError("Missing named parameters");
      throw new RangeError("Too few parameter values were provided");
    }
    if (count > n) throw new RangeError("Too many parameter values were provided");
    return [values, kinds.join("")];
  }

  #query(args, limit) {
    const [values, kinds] = this.#bind(args);
    this.#db.verbose?.(this.source);
    const cells = call("query", this.#id, values, kinds, this.#safe, limit);
    const columns = cells.columns;
    const width = columns.length;
    const rows = [];
    const tables = this.#mode === "expand" ? this.columns().map((col) => col.table ?? "$") : null;
    if (width === 0) return rows;
    for (let i = 0; i < cells.length; i += width) {
      rows.push(this.#row(cells, i, width, columns, tables));
    }
    return rows;
  }

  #row(cells, start, width, columns, tables) {
    const value = (c) => {
      const v = cells[start + c];
      return v instanceof Uint8Array ? toBlob(v) : v;
    };
    switch (this.#mode) {
      case "pluck":
        return value(0);
      case "raw": {
        const row = new Array(width);
        for (let c = 0; c < width; c++) row[c] = value(c);
        return row;
      }
      case "expand": {
        const row = {};
        for (let c = 0; c < width; c++) {
          const table = tables[c];
          if (!Object.hasOwn(row, table)) defineCell(row, table, {});
          defineCell(row[table], columns[c], value(c));
        }
        return row;
      }
      default: {
        const row = {};
        for (let c = 0; c < width; c++) defineCell(row, columns[c], value(c));
        return row;
      }
    }
  }
}
