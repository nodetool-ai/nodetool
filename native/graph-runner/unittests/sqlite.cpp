// Tests for the `sqlite` host capability (src/host/sqlite.cpp): CRUD, BLOB
// and BigInt round trips, transactions, errors as JavaScript errors,
// sqlite-vec KNN, and the directory grant. With a bundle argument it also
// runs the better-sqlite3 wrapper tests (unittests/sqlite-wrapper.test.mjs,
// bundled with guest/host/sqlite.mjs by esbuild).
//
//   gr_sqlite_tests [sqlite-wrapper-test.js]
#include "host/capabilities.h"
#include "js/engine.h"

#include <cstdio>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iterator>
#include <string>
#include <unistd.h>
#include <vector>

namespace {

namespace fs = std::filesystem;
namespace js = gr::js;

// native-rules #14: file-scope mutable test counters
int failures = 0;
int checks = 0;

#define CHECK(cond)                                                    \
  do {                                                                 \
    ++checks;                                                          \
    if (!(cond)) {                                                     \
      ++failures;                                                      \
      std::fprintf(stderr, "%s:%d: CHECK failed: %s\n", __FILE__,      \
                   __LINE__, #cond);                                   \
    }                                                                  \
  } while (0)

// A fresh directory under the system temp directory, removed on scope exit.
struct TempDir {
  fs::path path;
  TempDir() {
    path = fs::temp_directory_path() / ("gr-sqlite-" + std::to_string(::getpid()) + "-" +
                                        std::to_string(counter()++));
    fs::remove_all(path);
    fs::create_directories(path);
  }
  ~TempDir() {
    std::error_code ec;
    fs::remove_all(path, ec);
  }
  static int& counter() {
    // native-rules #14: function-local static mutable counter
    static int n = 0;
    return n;
  }
};

// An engine with __host.sqlite installed the way the kernel installs it.
struct Guest {
  std::unique_ptr<js::Engine> e = js::createQuickJsEngine();
  explicit Guest(const gr::HostOptions& options) {
    js::Value host = e->object();
    for (const auto& capability : gr::host::capabilities()) {
      js::Value object = e->object();
      capability.install(*e, object, options);
      e->set(host, capability.name, object);
    }
    e->set(e->global(), "__host", host);
    e->evaluateScript(R"JS(
      globalThis.S = __host.sqlite;
      globalThis.problems = [];
      globalThis.expect = (cond, label) => { if (!cond) problems.push(label); };
      globalThis.thrown = (fn) => { try { fn(); return ""; } catch (e) { return e.message; } };
      globalThis.f32 = (a) => new Uint8Array(new Float32Array(a).buffer);
    )JS",
                      "prelude.js");
  }
  // Runs `body` and returns the labels of the failed expectations, or the
  // exception it threw.
  std::string run(const std::string& body) {
    try {
      e->evaluateScript("problems = [];\n" + body, "test.js");
      return e->toString(e->evaluateScript("problems.join('; ')", "result.js"));
    } catch (const js::JsError& err) {
      return std::string("threw: ") + err.what();
    }
  }
};

bool pass(const std::string& result) {
  if (!result.empty()) std::fprintf(stderr, "  %s\n", result.c_str());
  return result.empty();
}

void crudInMemory() {
  Guest g({});
  CHECK(pass(g.run(R"JS(
    const db = S.open(":memory:", false, false, 5000);
    S.exec(db, "CREATE TABLE t (id INTEGER PRIMARY KEY, name TEXT, score REAL); -- comment\n;");
    const ins = S.prepare(db, "INSERT INTO t (name, score) VALUES (?, ?)", false);
    expect(ins.reader === false && ins.readonly === false, "insert is a writer");
    expect(ins.params.length === 2 && ins.params[0] === null, "anonymous params");
    let info = S.run(ins.id, ["ada", 1.5], "sd", false);
    expect(info.changes === 1 && info.lastInsertRowid === 1, "first insert");
    info = S.run(ins.id, ["bob", null], "sn", false);
    expect(info.lastInsertRowid === 2, "second insert");
    const sel = S.prepare(db, "SELECT id, name, score FROM t WHERE id >= :min ORDER BY id", false);
    expect(sel.reader && sel.readonly, "select is a reader");
    expect(sel.params[0] === ":min", "named param keeps its prefix");
    expect(sel.columns.join() === "id,name,score", "column names");
    let cells = S.query(sel.id, [1], "d", false, 0);
    expect(JSON.stringify(cells) === '[1,"ada",1.5,2,"bob",null]', "all rows " + JSON.stringify(cells));
    cells = S.query(sel.id, [1], "d", false, 1);
    expect(cells.length === 3, "limit 1 returns one row");
    const upd = S.prepare(db, "UPDATE t SET score = ? WHERE name = ?", false);
    expect(S.run(upd.id, [7, "bob"], "ds", false).changes === 1, "update");
    const del = S.prepare(db, "DELETE FROM t WHERE id = ?", false);
    expect(S.run(del.id, [1], "d", false).changes === 1, "delete");
    // A statement that changed nothing reports 0 changes.
    expect(S.run(del.id, [1], "d", false).changes === 0, "no-op delete");
    expect(JSON.stringify(S.query(sel.id, [0], "d", false, 0)) === '[2,"bob",7]', "after update/delete");
    const pragma = S.prepare(db, "PRAGMA foreign_keys", true);
    expect(S.query(pragma.id, [], "", false, 0)[0] === 1, "foreign keys default on, as in better-sqlite3");
    S.finalize(sel.id);
    expect(thrown(() => S.query(sel.id, [1], "d", false, 0)).startsWith("TypeError: "), "finalized statement");
    S.close(db);
    expect(thrown(() => S.prepare(db, "SELECT 1", false)) === "TypeError: The database connection is not open", "closed db");
  )JS")));
}

void blobAndBigIntRoundTrip() {
  Guest g({});
  CHECK(pass(g.run(R"JS(
    const db = S.open(":memory:", false, false, 5000);
    S.exec(db, "CREATE TABLE b (k INTEGER, v BLOB)");
    const ins = S.prepare(db, "INSERT INTO b VALUES (?, ?)", false);
    const big = 9007199254740993n;  // 2^53 + 1, not a safe double
    const view = new Uint8Array([9, 0, 1, 255, 7]).subarray(1, 4);
    let info = S.run(ins.id, [String(big), view], "ib", true);
    expect(typeof info.lastInsertRowid === "bigint" && info.lastInsertRowid === 1n, "bigint rowid in safe mode");
    S.run(ins.id, ["-9223372036854775808", new Uint8Array(0)], "ib", false);
    const sel = S.prepare(db, "SELECT k, v, typeof(v) FROM b ORDER BY rowid", false);
    let cells = S.query(sel.id, [], "", true, 0);
    expect(cells[0] === big, "bigint read back exactly");
    expect(cells[1] instanceof Uint8Array && cells[1].join() === "0,1,255", "blob bytes " + cells[1]);
    expect(cells[3] === -9223372036854775808n, "int64 min");
    expect(cells[4] instanceof Uint8Array && cells[4].length === 0 && cells[5] === "blob", "empty blob stays a blob");
    cells = S.query(sel.id, [], "", false, 0);
    expect(typeof cells[0] === "number" && cells[0] === 9007199254740992, "number mode rounds like better-sqlite3");
    expect(thrown(() => S.run(ins.id, ["9223372036854775808", null], "in", false)).startsWith("RangeError: "),
           "bigint above int64 is a RangeError");
    const real = S.prepare(db, "SELECT typeof(?), typeof(?)", false);
    expect(S.query(real.id, [3, "3"], "di", false, 0).join() === "real,integer", "numbers bind as REAL, bigints as INTEGER");
  )JS")));
}

void transactions() {
  Guest g({});
  CHECK(pass(g.run(R"JS(
    const db = S.open(":memory:", false, false, 5000);
    S.exec(db, "CREATE TABLE t (x)");
    const ins = S.prepare(db, "INSERT INTO t VALUES (?)", false);
    const count = S.prepare(db, "SELECT count(*) FROM t", false);
    expect(S.inTransaction(db) === false, "autocommit");
    S.exec(db, "BEGIN");
    expect(S.inTransaction(db) === true, "in transaction");
    S.run(ins.id, [1], "d", false);
    S.exec(db, "ROLLBACK");
    expect(S.query(count.id, [], "", false, 0)[0] === 0, "rollback undoes the insert");
    S.exec(db, "BEGIN; INSERT INTO t VALUES (2); SAVEPOINT s; INSERT INTO t VALUES (3); ROLLBACK TO s; RELEASE s; COMMIT");
    expect(S.query(count.id, [], "", false, 0)[0] === 1, "savepoint rollback keeps the outer insert");
  )JS")));
}

void errorsSurfaceAsJavaScriptErrors() {
  Guest g({});
  CHECK(pass(g.run(R"JS(
    const db = S.open(":memory:", false, false, 5000);
    S.exec(db, "CREATE TABLE u (id TEXT PRIMARY KEY, n INTEGER NOT NULL)");
    const ins = S.prepare(db, "INSERT INTO u VALUES (?, ?)", false);
    S.run(ins.id, ["a", 1], "sd", false);
    let caught = null;
    try { S.run(ins.id, ["a", 2], "sd", false); } catch (e) { caught = e; }
    expect(caught instanceof Error, "an Error");
    expect(caught?.message === "SQLITE_CONSTRAINT_PRIMARYKEY: UNIQUE constraint failed: u.id", "constraint: " + caught?.message);
    expect(thrown(() => S.run(ins.id, ["b", null], "sn", false)).startsWith("SQLITE_CONSTRAINT_NOTNULL: "), "not null");
    expect(thrown(() => S.prepare(db, "SELEC 1", false)).startsWith("SQLITE_ERROR: "), "syntax error");
    expect(thrown(() => S.prepare(db, "SELECT 1; SELECT 2", false)) ===
           "RangeError: The supplied SQL string contains more than one statement", "two statements");
    expect(thrown(() => S.prepare(db, "  -- nothing\n", false)) ===
           "RangeError: The supplied SQL string contains no statements", "no statement");
    expect(thrown(() => S.query(ins.id, ["c", 1], "sd", false, 0)).startsWith("TypeError: This statement does not return data"),
           "query on a writer");
    expect(thrown(() => S.run(ins.id, ["c", 1, 2], "sdd", false)) === "RangeError: Too many parameter values were provided",
           "too many values");
    expect(thrown(() => S.exec(db, "INSERT INTO nope VALUES (1)")).startsWith("SQLITE_ERROR: no such table"), "exec error");
    // The connection still works after errors.
    expect(S.run(ins.id, ["c", 3], "sd", false).changes === 1, "usable after errors");
    const sel = S.prepare(db, "SELECT 1", false);
    for (const bad of [NaN, Infinity, -Infinity, 2 ** 31, -(2 ** 31) - 1, 1.5]) {
      expect(thrown(() => S.close(bad)).startsWith("RangeError: "), "close id " + bad);
      expect(thrown(() => S.exec(bad, "SELECT 1")).startsWith("RangeError: "), "exec db id " + bad);
      expect(thrown(() => S.prepare(bad, "SELECT 1", false)).startsWith("RangeError: "), "prepare db id " + bad);
      expect(thrown(() => S.run(bad, [], "", false)).startsWith("RangeError: "), "run statement id " + bad);
      expect(thrown(() => S.query(bad, [], "", false, 0)).startsWith("RangeError: "), "query statement id " + bad);
      expect(thrown(() => S.query(sel.id, [], "", false, bad)).startsWith("RangeError: "), "query limit " + bad);
      expect(thrown(() => S.open(":memory:", false, false, bad)).startsWith("RangeError: "), "open timeout " + bad);
    }
  )JS")));
}

void sqliteVecKnn() {
  Guest g({});
  CHECK(pass(g.run(R"JS(
    const db = S.open(":memory:", false, false, 5000);
    expect(thrown(() => S.exec(db, "CREATE VIRTUAL TABLE v USING vec0(e float[3])")).startsWith("SQLITE_ERROR: no such module"),
           "vec0 needs loadExtension");
    expect(thrown(() => S.loadExtension(db, "/usr/lib/libevil.so")).startsWith("SQLITE_ERROR: only the built-in"),
           "other extensions refused");
    S.loadExtension(db, "vec0");
    const version = S.prepare(db, "SELECT vec_version()", false);
    expect(S.query(version.id, [], "", false, 0)[0] === "v0.1.9", "sqlite-vec version");
    S.exec(db, "CREATE VIRTUAL TABLE v USING vec0(e float[3])");
    const ins = S.prepare(db, "INSERT INTO v (rowid, e) VALUES (?, ?)", false);
    S.run(ins.id, ["1", f32([1, 0, 0])], "ib", false);
    S.run(ins.id, ["2", f32([0, 1, 0])], "ib", false);
    S.run(ins.id, ["3", f32([0.9, 0.1, 0])], "ib", false);
    const knn = S.prepare(db, "SELECT rowid, distance FROM v WHERE e MATCH ? AND k = ? ORDER BY distance", false);
    const cells = S.query(knn.id, [f32([1, 0, 0]), 2], "bd", false, 0);
    expect(cells.length === 4 && cells[0] === 1 && cells[2] === 3, "nearest two: " + JSON.stringify(cells));
    expect(cells[1] === 0 && Math.abs(cells[3] - Math.hypot(0.1, 0.1)) < 1e-6, "L2 distances");
    // The load-extension SQL function is compiled out.
    expect(thrown(() => S.exec(db, "SELECT load_extension('x')")).startsWith("SQLITE_ERROR: no such function"),
           "no load_extension()");
  )JS")));
}

void pathsOutsideTheGrantAreRefused() {
  TempDir root;
  TempDir outside;
  fs::create_directories(root.path / "sub");
  fs::create_symlink(outside.path, root.path / "escape");
  { std::ofstream(outside.path / "victim.db") << ""; }
  fs::create_symlink(outside.path / "victim.db", root.path / "link.db");

  // Without a grant only in-memory databases open.
  {
    Guest g({});
    CHECK(pass(g.run(R"JS(
      expect(S.directory() === null, "no directory");
      expect(thrown(() => S.open("a.db", false, false, 0)).startsWith("SQLITE_CANTOPEN: database files are not granted"),
             "file refused without a grant");
      expect(thrown(() => S.open("/tmp/x.db", false, false, 0)).startsWith("SQLITE_CANTOPEN: "), "absolute refused");
      const db = S.open(":memory:", false, false, 0);
      expect(thrown(() => S.exec(db, "ATTACH '/tmp/gr-sqlite-attach.db' AS x")) !== "", "ATTACH refused without a grant");
      const tmp = S.open("", false, false, 0);  // anonymous temporary database
      S.exec(tmp, "CREATE TABLE t (x); INSERT INTO t VALUES (1)");
    )JS")));
  }

  gr::HostOptions options;
  options.sqliteDirectory = root.path.string();
  Guest g(options);
  const std::string canonical = fs::canonical(root.path).string();
  const std::string out = outside.path.string();
  g.e->set(g.e->global(), "ROOT", g.e->string(canonical));
  g.e->set(g.e->global(), "OUTSIDE", g.e->string(out));
  CHECK(pass(g.run(R"JS(
    expect(S.directory() === ROOT, "directory is the canonical grant");
    const db = S.open("data.db", false, false, 5000);
    S.exec(db, "PRAGMA journal_mode = WAL; CREATE TABLE t (x); INSERT INTO t VALUES (1)");
    S.close(db);
    const again = S.open(ROOT + "/data.db", false, true, 5000);
    const q = S.prepare(again, "SELECT count(*) FROM t", false);
    expect(S.query(q.id, [], "", false, 0)[0] === 1, "absolute path inside the grant reopens the file");
    const nested = S.open("sub/../sub/n.db", false, false, 0);
    S.exec(nested, "CREATE TABLE n (x)");
    const refused = (name) => thrown(() => S.open(name, false, false, 0));
    expect(refused("../escape.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "dot-dot");
    expect(refused("sub/../../escape.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "nested dot-dot");
    expect(refused(OUTSIDE + "/abs.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "absolute outside");
    expect(refused("escape/x.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "symlinked directory");
    expect(refused("link.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "symlinked file");
    expect(refused(ROOT).startsWith("SQLITE_CANTOPEN: database path is outside"), "the directory itself");
    expect(refused("file:x.db?mode=rwc").startsWith("SQLITE_CANTOPEN: URI filenames"), "URI filename");
    expect(refused("missing/x.db") === "TypeError: Cannot open database because the directory does not exist", "missing dir");
    expect(thrown(() => S.open("absent.db", false, true, 0)).startsWith("SQLITE_CANTOPEN: "), "fileMustExist");
    // SQL cannot reach outside either: ATTACH and VACUUM INTO go through the
    // sandbox VFS. `nested` was opened with SQLITE_OPEN_CREATE, which ATTACH
    // inherits, so only the sandbox stops these.
    const refusedSql = (sql) => thrown(() => S.exec(nested, sql));
    expect(refusedSql("ATTACH '" + OUTSIDE + "/att.db' AS a").startsWith("SQLITE_"), "ATTACH outside refused");
    expect(refusedSql("ATTACH '" + ROOT + "/escape/att.db' AS a").startsWith("SQLITE_"), "ATTACH through symlink refused");
    expect(refusedSql("ATTACH '../att.db' AS a").startsWith("SQLITE_"), "relative ATTACH outside refused");
    expect(refusedSql("VACUUM INTO '" + OUTSIDE + "/copy.db'").startsWith("SQLITE_"), "VACUUM INTO outside refused");
    S.exec(nested, "ATTACH 'inside.db' AS a; CREATE TABLE a.t (x); DETACH a");
    S.exec(nested, "VACUUM INTO 'copy.db'");
    S.exec(again, "VACUUM");
  )JS")));
  CHECK(fs::exists(root.path / "data.db"));
  CHECK(fs::exists(root.path / "sub" / "n.db"));
  CHECK(fs::exists(root.path / "copy.db"));
  CHECK(fs::exists(root.path / "inside.db"));
  CHECK(!fs::exists(root.path.parent_path() / "att.db"));
  CHECK(!fs::exists(outside.path / "abs.db"));
  CHECK(!fs::exists(outside.path / "att.db"));
  CHECK(!fs::exists(outside.path / "copy.db"));
  CHECK(!fs::exists(outside.path / "x.db"));
  CHECK(fs::file_size(outside.path / "victim.db") == 0);
}

// The grant named through a symlink, as $TMPDIR is below /var -> /private/var
// on macOS: an absolute path in the named spelling opens, and a link below the
// grant that leaves it is still refused.
void grantNamedThroughASymlink() {
  TempDir base;
  TempDir outside;
  fs::create_directories(base.path / "real");
  fs::create_directory_symlink(base.path / "real", base.path / "named");
  fs::create_symlink(outside.path, base.path / "real" / "escape");
  gr::HostOptions options;
  options.sqliteDirectory = (base.path / "named").string() + "/";
  Guest g(options);
  g.e->set(g.e->global(), "NAMED", g.e->string((base.path / "named").string()));
  CHECK(pass(g.run(R"JS(
    const db = S.open(NAMED + "/a.db", false, false, 0);
    S.exec(db, "CREATE TABLE t (x)");
    const refused = (name) => thrown(() => S.open(name, false, false, 0));
    expect(refused(NAMED + "/../a.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "dot-dot");
    expect(refused(NAMED + "/escape/x.db").startsWith("SQLITE_CANTOPEN: database path is outside"), "symlinked directory");
    expect(refused(NAMED).startsWith("SQLITE_CANTOPEN: database path is outside"), "the directory itself");
  )JS")));
  CHECK(fs::exists(base.path / "real" / "a.db"));
  CHECK(!fs::exists(outside.path / "x.db"));
}

// The better-sqlite3 wrapper (guest/host/sqlite.mjs) and the sqlite-vec
// module, bundled with their test script.
void wrapper(const std::string& bundle) {
  std::ifstream in(bundle, std::ios::binary);
  CHECK(in.good());
  if (!in.good()) return;
  std::string source((std::istreambuf_iterator<char>(in)), std::istreambuf_iterator<char>());
  TempDir root;
  gr::HostOptions options;
  options.sqliteDirectory = root.path.string();
  Guest g(options);
  try {
    g.e->evaluateScript(source, bundle);
    const std::string result = g.e->toString(g.e->evaluateScript("globalThis.wrapperResult", "result.js"));
    if (result != "ok") std::fprintf(stderr, "  %s\n", result.c_str());
    CHECK(result == "ok");
  } catch (const js::JsError& err) {
    std::fprintf(stderr, "  threw: %s\n", err.what());
    CHECK(false);
  }
}

}  // namespace

int main(int argc, char** argv) {
  std::vector<std::pair<const char*, std::function<void()>>> tests = {
      {"crudInMemory", crudInMemory},
      {"blobAndBigIntRoundTrip", blobAndBigIntRoundTrip},
      {"transactions", transactions},
      {"errorsSurfaceAsJavaScriptErrors", errorsSurfaceAsJavaScriptErrors},
      {"sqliteVecKnn", sqliteVecKnn},
      {"pathsOutsideTheGrantAreRefused", pathsOutsideTheGrantAreRefused},
      {"grantNamedThroughASymlink", grantNamedThroughASymlink},
  };
  if (argc > 1) tests.emplace_back("wrapper", [bundle = std::string(argv[1])] { wrapper(bundle); });
  for (const auto& [name, fn] : tests) {
    int before = failures;
    fn();
    std::fprintf(stderr, "%s %s\n", failures == before ? "PASS" : "FAIL", name);
  }
  std::fprintf(stderr, "%d checks, %d failed\n", checks, failures);
  return failures == 0 ? 0 : 1;
}
