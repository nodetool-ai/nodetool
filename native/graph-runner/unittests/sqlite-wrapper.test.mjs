// Tests for the better-sqlite3 API in guest/host/sqlite.mjs and the
// sqlite-vec module in guest/host/sqlite-vec.mjs. gr_sqlite_tests runs the
// esbuild bundle of this file in QuickJS with __host.sqlite installed and a
// granted directory, then reads globalThis.wrapperResult.
import Database, { SqliteError } from "../guest/host/sqlite.mjs";
import * as sqliteVec from "../guest/host/sqlite-vec.mjs";

const problems = [];
const expect = (cond, label) => {
  if (!cond) problems.push(label);
};
const caught = (fn) => {
  try {
    fn();
  } catch (err) {
    return err;
  }
  return null;
};

function crud() {
  const db = new Database(":memory:");
  expect(db.open && db.memory && db.name === ":memory:" && !db.readonly, "database properties");
  db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL, meta TEXT)");
  const ins = db.prepare("INSERT INTO t (name, score, meta) VALUES (@name, $score, :meta)");
  expect(ins.reader === false && ins.source.startsWith("INSERT"), "statement properties");
  const info = ins.run({ name: "ada", score: 1.5, meta: null });
  expect(info.changes === 1 && info.lastInsertRowid === 1, "run info");
  ins.run({ name: "bob", score: 2, meta: "x" });
  const err = caught(() => ins.run({ name: "eve", score: 1 }));
  expect(err instanceof RangeError && err.message === 'Missing named parameter "meta"', "missing named");
  const anon = db.prepare("INSERT INTO t (name, score) VALUES (?, ?)");
  anon.run(["cy", 3]);
  anon.run("dee", 4);
  expect(caught(() => anon.run("x")) instanceof RangeError, "too few values");
  expect(caught(() => anon.run("x", true)) instanceof TypeError, "booleans do not bind");

  const sel = db.prepare("SELECT id, name, score FROM t WHERE score >= ? ORDER BY id");
  expect(JSON.stringify(sel.get(2)) === '{"id":2,"name":"bob","score":2}', "get");
  expect(sel.get(100) === undefined, "get with no row");
  expect(sel.all(2).map((r) => r.name).join() === "bob,cy,dee", "all");
  expect([...sel.iterate(3)].map((r) => r.id).join() === "3,4", "iterate");
  expect(JSON.stringify(sel.raw().get(3)) === '[3,"cy",3]', "raw");
  expect(sel.pluck().all(3).join() === "3,4", "pluck");
  sel.pluck(false);
  expect(typeof sel.get(3) === "object" && !Array.isArray(sel.get(3)), "pluck(false) back to rows");
  const joined = db.prepare("SELECT t.id, t.name FROM t WHERE t.id = 1").expand().get();
  expect(joined?.t?.name === "ada", "expand");
  expect(sel.columns().map((c) => `${c.name}:${c.table}:${c.type}`).join() === "id:t:INTEGER,name:t:TEXT,score:t:REAL",
         "columns()");
  const bound = db.prepare("SELECT name FROM t WHERE id = ?").bind(2).pluck();
  expect(bound.get() === "bob", "bind");
  expect(caught(() => bound.get(1)) instanceof TypeError, "bound statement rejects arguments");

  expect(db.prepare("DELETE FROM t WHERE id = ?").run(1).changes === 1, "delete");
  expect(db.prepare("UPDATE t SET score = score + 1").run().changes === 3, "update");
  expect(caught(() => db.prepare("SELECT 1; SELECT 2")) instanceof RangeError, "two statements");
  expect(caught(() => db.prepare("INSERT INTO t (name) VALUES ('z')").get()) instanceof TypeError, "get on a writer");
  db.close();
  expect(!db.open, "closed");
  expect(caught(() => db.prepare("SELECT 1"))?.message === "The database connection is not open", "prepare after close");
}

function blobsAndBigInts() {
  const db = new Database("");
  db.exec("CREATE TABLE b (k INTEGER, v BLOB)");
  const big = 2n ** 62n + 3n;
  const ins = db.prepare("INSERT INTO b VALUES (?, ?)");
  ins.run(big, new Uint8Array([1, 2, 3]));
  ins.run(5, new Float32Array([1.5]));
  const row = db.prepare("SELECT k, v FROM b WHERE rowid = 1").safeIntegers().get();
  expect(row.k === big, "BigInt round trip");
  expect(row.v instanceof Uint8Array && row.v.join() === "1,2,3", "BLOB round trip");
  const second = db.prepare("SELECT k, v FROM b WHERE rowid = 2").get();
  expect(second.k === 5 && new Float32Array(second.v.buffer, second.v.byteOffset, 1)[0] === 1.5, "typed array binds as BLOB");
  expect(typeof db.prepare("SELECT k FROM b WHERE rowid = 1").pluck().get() === "number", "number by default");
  db.defaultSafeIntegers();
  expect(db.prepare("SELECT 1").pluck().get() === 1n, "defaultSafeIntegers");
  expect(db.prepare("INSERT INTO b VALUES (1, NULL)").run().lastInsertRowid === 3n, "BigInt lastInsertRowid");
  db.close();
}

function transactions() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t (x INTEGER UNIQUE)");
  const ins = db.prepare("INSERT INTO t VALUES (?)");
  const count = db.prepare("SELECT count(*) FROM t").pluck();
  const many = db.transaction((xs) => {
    for (const x of xs) ins.run(x);
    return xs.length;
  });
  expect(many([1, 2]) === 2 && count.get() === 2, "commit");
  const err = caught(() => many([3, 1]));
  expect(err instanceof SqliteError && err.code === "SQLITE_CONSTRAINT_UNIQUE", "constraint error code");
  expect(count.get() === 2 && !db.inTransaction, "rollback on throw");
  const outer = db.transaction(() => {
    ins.run(10);
    expect(db.inTransaction, "inTransaction inside");
    caught(() => many([11, 10]));
    ins.run(12);
  });
  outer.immediate();
  expect(count.get() === 4, "nested transaction rolls back to its savepoint only");
  expect(caught(() => db.transaction(async () => {})()) instanceof TypeError, "async transaction refused");
  expect(typeof many.deferred === "function" && typeof many.exclusive === "function", "variants");
  db.close();
}

function pragmas() {
  const db = new Database(":memory:");
  expect(db.pragma("user_version", { simple: true }) === 0, "simple pragma");
  db.pragma("user_version = 7");
  expect(db.pragma("user_version")[0].user_version === 7, "pragma rows");
  db.exec('CREATE TABLE "x" (a TEXT NOT NULL DEFAULT \'q\', b INTEGER)');
  const cols = db.pragma('table_info("x")');
  expect(cols.length === 2 && cols[0].name === "a" && cols[0].notnull === 1 && cols[0].dflt_value === "'q'",
         "table_info");
  db.close();
}

function errors() {
  const err = caught(() => new Database(":memory:").exec("SELEC"));
  expect(err instanceof SqliteError && err instanceof Error && err.name === "SqliteError" && err.code === "SQLITE_ERROR",
         "SqliteError");
  expect(caught(() => new Database(":memory:", { readonly: true })) instanceof TypeError, "readonly memory");
  expect(caught(() => new Database(":memory:").function("f", () => 1))?.message.includes("is unavailable in the native runner"),
         "unsupported method names itself");
  const outside = caught(() => new Database("../outside.db"));
  expect(outside instanceof SqliteError && outside.code === "SQLITE_CANTOPEN", "outside the grant");
}

function files() {
  const db = new Database("store.db");
  expect(!db.memory && db.name === "store.db", "file database");
  db.pragma("journal_mode = WAL");
  db.exec("CREATE TABLE t (x); INSERT INTO t VALUES (42)");
  db.close();
  const ro = new Database("store.db", { readonly: true, fileMustExist: true });
  expect(ro.prepare("SELECT x FROM t").pluck().get() === 42 && ro.readonly, "reopened read-only");
  const write = caught(() => ro.exec("INSERT INTO t VALUES (1)"));
  expect(write instanceof SqliteError && write.code === "SQLITE_READONLY", "read-only refuses writes");
  ro.close();
  expect(caught(() => new Database("absent.db", { fileMustExist: true }))?.code === "SQLITE_CANTOPEN", "fileMustExist");
}

function vectors() {
  const db = new Database(":memory:");
  sqliteVec.load(db);
  expect(sqliteVec.getLoadablePath() === "vec0", "loadable path");
  db.exec("CREATE VIRTUAL TABLE v USING vec0(embedding float[2])");
  const ins = db.prepare("INSERT INTO v(embedding) VALUES (?)");
  const ids = [[0, 1], [1, 0], [0.8, 0.2]].map((e) => ins.run(new Uint8Array(new Float32Array(e).buffer)).lastInsertRowid);
  expect(ids.join() === "1,2,3", "vec0 rowids");
  const rows = db
    .prepare("SELECT rowid, distance FROM v WHERE embedding MATCH ? AND k = ? ORDER BY distance")
    .all(new Uint8Array(new Float32Array([1, 0]).buffer), 2);
  expect(rows.map((r) => r.rowid).join() === "2,3" && rows[0].distance === 0, "KNN " + JSON.stringify(rows));
  expect(caught(() => db.loadExtension("/tmp/other.so"))?.code === "SQLITE_ERROR", "other extensions refused");
  db.close();
}

function specialColumnNames() {
  const db = new Database(":memory:");
  const row = db.prepare("SELECT 1 AS '__proto__', 2 AS constructor").get();
  expect(Object.hasOwn(row, "__proto__") && row.__proto__ === 1, "own __proto__ column");
  expect(Object.getPrototypeOf(row) === Object.prototype && row.constructor === 2, "ordinary row prototype");
  db.exec('CREATE TABLE "__proto__" (sqliteReviewPolluted); INSERT INTO "__proto__" VALUES (42)');
  const expanded = db.prepare('SELECT * FROM "__proto__"').expand().get();
  expect(Object.hasOwn(expanded, "__proto__") && expanded.__proto__.sqliteReviewPolluted === 42,
         "own __proto__ table group");
  expect(!Object.hasOwn(Object.prototype, "sqliteReviewPolluted"), "expand preserves Object.prototype");
  delete Object.prototype.sqliteReviewPolluted;
  db.close();
}

function schemaReprepare() {
  const db = new Database(":memory:");
  db.exec("CREATE TABLE t(a); INSERT INTO t VALUES (1),(2)");
  const flat = db.prepare("SELECT * FROM t");
  const raw = db.prepare("SELECT * FROM t").raw();
  const expanded = db.prepare("SELECT * FROM t").expand();
  expanded.get();
  db.exec("ALTER TABLE t ADD COLUMN b DEFAULT 7");
  expect(JSON.stringify(flat.all()) === '[{"a":1,"b":7},{"a":2,"b":7}]', "reprepared row width and names");
  expect(JSON.stringify(raw.all()) === '[[1,7],[2,7]]', "reprepared raw rows");
  expect(JSON.stringify(expanded.all()) === '[{"t":{"a":1,"b":7}},{"t":{"a":2,"b":7}}]',
         "reprepared expanded metadata");
  db.exec("ALTER TABLE t RENAME COLUMN b TO renamed");
  expect(JSON.stringify(flat.get()) === '{"a":1,"renamed":7}', "reprepared renamed column");
  db.exec("DELETE FROM t; ALTER TABLE t ADD COLUMN emptyColumn");
  expect(flat.all().length === 0 && flat.columns().length === 3, "reprepared empty result metadata");
  db.close();
}

for (const test of [crud, blobsAndBigInts, transactions, pragmas, errors, files, vectors, specialColumnNames, schemaReprepare]) {
  try {
    test();
  } catch (err) {
    problems.push(`${test.name} threw ${err?.name}: ${err?.message}`);
  }
}
globalThis.wrapperResult = problems.length === 0 ? "ok" : problems.join("; ");
