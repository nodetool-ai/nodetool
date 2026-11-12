// The `sqlite` host capability. See sqlite.h for the guest-facing functions.
#include "host/sqlite.h"

#include <sqlite-vec.h>
#include <sqlite3.h>

#include <cerrno>
#include <climits>
#include <cmath>
#include <cstdio>
#include <cstdlib>
#include <filesystem>
#include <map>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <unordered_map>
#include <vector>

namespace gr::host {
namespace {

namespace fs = std::filesystem;
using Args = const std::vector<js::Value>&;

// --- sandbox VFS ------------------------------------------------------------
//
// Wraps the platform VFS. Every named file must lie inside `root`, which is a
// canonical path, or be unnamed (SQLite's own temporary files). An empty root
// allows no named file. SQLite hands xOpen, xDelete and xAccess the path its
// xFullPathname produced, which on unix has every symbolic link resolved, so a
// link inside the directory that points out of it is refused here.

struct SandboxVfs {
  sqlite3_vfs vfs{};
  sqlite3_vfs* base = nullptr;
  std::string root;
  std::string name;
};

sqlite3_vfs* baseOf(sqlite3_vfs* v) { return static_cast<SandboxVfs*>(v->pAppData)->base; }

bool inside(sqlite3_vfs* v, const char* path) {
  const std::string& root = static_cast<SandboxVfs*>(v->pAppData)->root;
  if (root.empty() || path == nullptr) return false;
  std::string p(path);
  const std::string prefix = root.back() == '/' ? root : root + "/";
  return p.rfind(prefix, 0) == 0 && p.find("/../") == std::string::npos;
}

int vfsOpen(sqlite3_vfs* v, sqlite3_filename name, sqlite3_file* file, int flags, int* outFlags) {
  if (name != nullptr && !inside(v, name)) {
    file->pMethods = nullptr;
    return SQLITE_PERM;
  }
  return baseOf(v)->xOpen(baseOf(v), name, file, flags, outFlags);
}
int vfsDelete(sqlite3_vfs* v, const char* name, int syncDir) {
  if (!inside(v, name)) return SQLITE_PERM;
  return baseOf(v)->xDelete(baseOf(v), name, syncDir);
}
int vfsAccess(sqlite3_vfs* v, const char* name, int flags, int* out) {
  if (!inside(v, name)) {
    *out = 0;
    return SQLITE_OK;
  }
  return baseOf(v)->xAccess(baseOf(v), name, flags, out);
}
// Relative names (ATTACH 'x.db') resolve inside the granted directory, as
// database paths given to open() do, not against the process's directory.
int vfsFullPathname(sqlite3_vfs* v, const char* name, int n, char* out) {
  const std::string& root = static_cast<SandboxVfs*>(v->pAppData)->root;
  if (name != nullptr && name[0] != '/' && !root.empty()) {
    const std::string joined = root + "/" + name;
    return baseOf(v)->xFullPathname(baseOf(v), joined.c_str(), n, out);
  }
  return baseOf(v)->xFullPathname(baseOf(v), name, n, out);
}
int vfsRandomness(sqlite3_vfs* v, int n, char* out) {
  return baseOf(v)->xRandomness(baseOf(v), n, out);
}
int vfsSleep(sqlite3_vfs* v, int us) { return baseOf(v)->xSleep(baseOf(v), us); }
int vfsCurrentTime(sqlite3_vfs* v, double* out) {
  return baseOf(v)->xCurrentTime(baseOf(v), out);
}
int vfsGetLastError(sqlite3_vfs* v, int n, char* out) {
  return baseOf(v)->xGetLastError ? baseOf(v)->xGetLastError(baseOf(v), n, out) : 0;
}
int vfsCurrentTimeInt64(sqlite3_vfs* v, sqlite3_int64* out) {
  return baseOf(v)->xCurrentTimeInt64(baseOf(v), out);
}

// One registered VFS per granted directory, kept for the life of the process
// (SQLite holds a pointer to it, and other runners may share it).
const char* sandboxVfs(const std::string& root) {
  // native-rules #14: process-wide mutex for the VFS registry
  static std::mutex mutex;
  // native-rules #14: process-wide VFS registry, never destroyed
  static std::map<std::string, std::unique_ptr<SandboxVfs>> registered;
  std::lock_guard<std::mutex> lock(mutex);
  auto it = registered.find(root);
  if (it != registered.end()) return it->second->name.c_str();
  sqlite3_vfs* base = sqlite3_vfs_find(nullptr);
  if (base == nullptr || base->iVersion < 2) throw std::runtime_error("SQLITE_ERROR: no usable SQLite VFS");
  auto s = std::make_unique<SandboxVfs>();
  s->base = base;
  s->root = root;
  s->name = "nodetool-sandbox-" + std::to_string(registered.size());
  sqlite3_vfs& v = s->vfs;
  v.iVersion = 2;
  v.szOsFile = base->szOsFile;
  v.mxPathname = base->mxPathname;
  v.zName = s->name.c_str();
  v.pAppData = s.get();
  v.xOpen = vfsOpen;
  v.xDelete = vfsDelete;
  v.xAccess = vfsAccess;
  v.xFullPathname = vfsFullPathname;
  v.xRandomness = vfsRandomness;
  v.xSleep = vfsSleep;
  v.xCurrentTime = vfsCurrentTime;
  v.xGetLastError = vfsGetLastError;
  v.xCurrentTimeInt64 = vfsCurrentTimeInt64;
  if (int rc = sqlite3_vfs_register(&v, 0); rc != SQLITE_OK) {
    throw std::runtime_error(std::string("SQLITE_ERROR: cannot register the sandbox VFS: ") + sqlite3_errstr(rc));
  }
  const char* name = s->name.c_str();
  registered.emplace(root, std::move(s));
  return name;
}

// --- result codes ------------------------------------------------------------

// The code names better-sqlite3 gives SqliteError#code.
std::string codeName(int code) {
  static const std::unordered_map<int, const char*> names = {
#define C(x) {x, #x}
      C(SQLITE_OK), C(SQLITE_ERROR), C(SQLITE_INTERNAL), C(SQLITE_PERM), C(SQLITE_ABORT),
      C(SQLITE_BUSY), C(SQLITE_LOCKED), C(SQLITE_NOMEM), C(SQLITE_READONLY),
      C(SQLITE_INTERRUPT), C(SQLITE_IOERR), C(SQLITE_CORRUPT), C(SQLITE_NOTFOUND),
      C(SQLITE_FULL), C(SQLITE_CANTOPEN), C(SQLITE_PROTOCOL), C(SQLITE_EMPTY),
      C(SQLITE_SCHEMA), C(SQLITE_TOOBIG), C(SQLITE_CONSTRAINT), C(SQLITE_MISMATCH),
      C(SQLITE_MISUSE), C(SQLITE_NOLFS), C(SQLITE_AUTH), C(SQLITE_FORMAT), C(SQLITE_RANGE),
      C(SQLITE_NOTADB), C(SQLITE_NOTICE), C(SQLITE_WARNING), C(SQLITE_ROW), C(SQLITE_DONE),
      C(SQLITE_ERROR_MISSING_COLLSEQ), C(SQLITE_ERROR_RETRY), C(SQLITE_ERROR_SNAPSHOT),
      C(SQLITE_IOERR_READ), C(SQLITE_IOERR_SHORT_READ), C(SQLITE_IOERR_WRITE),
      C(SQLITE_IOERR_FSYNC), C(SQLITE_IOERR_DIR_FSYNC), C(SQLITE_IOERR_TRUNCATE),
      C(SQLITE_IOERR_FSTAT), C(SQLITE_IOERR_UNLOCK), C(SQLITE_IOERR_RDLOCK),
      C(SQLITE_IOERR_DELETE), C(SQLITE_IOERR_BLOCKED), C(SQLITE_IOERR_NOMEM),
      C(SQLITE_IOERR_ACCESS), C(SQLITE_IOERR_CHECKRESERVEDLOCK), C(SQLITE_IOERR_LOCK),
      C(SQLITE_IOERR_CLOSE), C(SQLITE_IOERR_DIR_CLOSE), C(SQLITE_IOERR_SHMOPEN),
      C(SQLITE_IOERR_SHMSIZE), C(SQLITE_IOERR_SHMLOCK), C(SQLITE_IOERR_SHMMAP),
      C(SQLITE_IOERR_SEEK), C(SQLITE_IOERR_DELETE_NOENT), C(SQLITE_IOERR_MMAP),
      C(SQLITE_IOERR_GETTEMPPATH), C(SQLITE_IOERR_CONVPATH), C(SQLITE_IOERR_VNODE),
      C(SQLITE_IOERR_AUTH), C(SQLITE_IOERR_BEGIN_ATOMIC), C(SQLITE_IOERR_COMMIT_ATOMIC),
      C(SQLITE_IOERR_ROLLBACK_ATOMIC), C(SQLITE_IOERR_DATA), C(SQLITE_IOERR_CORRUPTFS),
      C(SQLITE_IOERR_IN_PAGE), C(SQLITE_LOCKED_SHAREDCACHE), C(SQLITE_LOCKED_VTAB),
      C(SQLITE_BUSY_RECOVERY), C(SQLITE_BUSY_SNAPSHOT), C(SQLITE_CANTOPEN_NOTEMPDIR),
      C(SQLITE_CANTOPEN_ISDIR), C(SQLITE_CANTOPEN_FULLPATH), C(SQLITE_CANTOPEN_CONVPATH),
      C(SQLITE_CANTOPEN_DIRTYWAL), C(SQLITE_CANTOPEN_SYMLINK), C(SQLITE_CORRUPT_VTAB),
      C(SQLITE_CORRUPT_SEQUENCE), C(SQLITE_CORRUPT_INDEX), C(SQLITE_READONLY_RECOVERY),
      C(SQLITE_READONLY_CANTLOCK), C(SQLITE_READONLY_ROLLBACK), C(SQLITE_READONLY_DBMOVED),
      C(SQLITE_READONLY_CANTINIT), C(SQLITE_READONLY_DIRECTORY), C(SQLITE_ABORT_ROLLBACK),
      C(SQLITE_CONSTRAINT_CHECK), C(SQLITE_CONSTRAINT_COMMITHOOK),
      C(SQLITE_CONSTRAINT_FOREIGNKEY), C(SQLITE_CONSTRAINT_FUNCTION),
      C(SQLITE_CONSTRAINT_NOTNULL), C(SQLITE_CONSTRAINT_PRIMARYKEY),
      C(SQLITE_CONSTRAINT_TRIGGER), C(SQLITE_CONSTRAINT_UNIQUE), C(SQLITE_CONSTRAINT_VTAB),
      C(SQLITE_CONSTRAINT_ROWID), C(SQLITE_CONSTRAINT_PINNED), C(SQLITE_CONSTRAINT_DATATYPE),
      C(SQLITE_NOTICE_RECOVER_WAL), C(SQLITE_NOTICE_RECOVER_ROLLBACK), C(SQLITE_NOTICE_RBU),
      C(SQLITE_WARNING_AUTOINDEX), C(SQLITE_OK_LOAD_PERMANENTLY), C(SQLITE_OK_SYMLINK),
#undef C
  };
  auto it = names.find(code);
  return it != names.end() ? it->second : "UNKNOWN_SQLITE_ERROR_" + std::to_string(code);
}

[[noreturn]] void fail(const std::string& kind, const std::string& message) {
  throw std::runtime_error(kind + ": " + message);
}

[[noreturn]] void dbError(sqlite3* db) {
  fail(codeName(sqlite3_extended_errcode(db)), sqlite3_errmsg(db));
}

// --- state -------------------------------------------------------------------

struct Statement {
  // native-rules #6: raw sqlite3_stmt finalized by hand
  sqlite3_stmt* handle = nullptr;
  int db = 0;
  bool reader = false;
};

// Everything one guest context opened. Owned by the capability's functions,
// so it closes when the engine that holds them is destroyed.
struct State {
  std::string root;      // canonical granted directory, or empty
  std::string given;     // the granted directory as named, lexically normal
  std::string vfs;       // sandbox VFS name
  // native-rules #6: raw sqlite3 handles closed by hand in the destructor
  std::unordered_map<int, sqlite3*> dbs;
  std::unordered_map<int, Statement> statements;
  int next = 1;

  ~State() {
    for (auto& [id, s] : statements) sqlite3_finalize(s.handle);
    for (auto& [id, db] : dbs) sqlite3_close_v2(db);
  }

  sqlite3* db(int id) {
    auto it = dbs.find(id);
    if (it == dbs.end()) fail("TypeError", "The database connection is not open");
    return it->second;
  }
  Statement& statement(int id) {
    auto it = statements.find(id);
    if (it == statements.end()) fail("TypeError", "The database connection is not open");
    return it->second;
  }
  void close(int id) {
    auto it = dbs.find(id);
    if (it == dbs.end()) return;
    for (auto s = statements.begin(); s != statements.end();) {
      if (s->second.db == id) {
        sqlite3_finalize(s->second.handle);
        s = statements.erase(s);
      } else {
        ++s;
      }
    }
    sqlite3_close_v2(it->second);
    dbs.erase(it);
  }
};

bool memoryName(const std::string& name) { return name.empty() || name == ":memory:"; }

// Resolves a guest database path inside the granted directory, or throws.
std::string resolvePath(const State& state, const std::string& filename) {
  if (state.root.empty()) {
    fail("SQLITE_CANTOPEN",
         "database files are not granted to this runner, only \":memory:\" (cannot open " + filename + ")");
  }
  if (filename.rfind("file:", 0) == 0) fail("SQLITE_CANTOPEN", "URI filenames are not supported: " + filename);
  const fs::path root(state.root);
  fs::path p(filename);
  if (p.is_relative()) p = root / p;
  p = p.lexically_normal();
  const auto outsideOf = [](const fs::path& dir, const fs::path& candidate) {
    const fs::path rel = candidate.lexically_relative(dir);
    return rel.empty() || *rel.begin() == ".." || rel == ".";
  };
  const auto outside = [&](const fs::path& candidate) { return outsideOf(root, candidate); };
  // The directory as named can sit below a symlink, such as /var -> /private/var
  // on macOS. The canonical check below still refuses a link that leaves it.
  const bool outsideGiven = state.given.empty() || outsideOf(fs::path(state.given), p);
  if (outside(p) && outsideGiven) fail("SQLITE_CANTOPEN", "database path is outside the granted directory: " + filename);
  std::error_code ec;
  const fs::path real = fs::weakly_canonical(p, ec);
  if (ec || outside(real)) {
    fail("SQLITE_CANTOPEN", "database path is outside the granted directory: " + filename);
  }
  if (!fs::is_directory(real.parent_path(), ec)) {
    fail("TypeError", "Cannot open database because the directory does not exist");
  }
  return real.string();
}

// --- value conversion ----------------------------------------------------------

// Guest numbers become int only after this check. NaN, infinite and
// out-of-range values are undefined behavior in the cast.
int toInt(js::Engine& e, const js::Value& v) {
  const double d = e.toNumber(v);
  if (!(d >= INT_MIN && d <= INT_MAX) || d != std::floor(d)) fail("RangeError", "expected an integer value");
  return static_cast<int>(d);
}

js::Value newArray(js::Engine& e) {
  js::Value ctor = e.get(e.global(), "Array");
  return e.call(ctor, e.undefined(), {});
}

js::Value bigInt(js::Engine& e, sqlite3_int64 v) {
  js::Value ctor = e.get(e.global(), "BigInt");
  return e.call(ctor, e.undefined(), {e.string(std::to_string(v))});
}

js::Value cell(js::Engine& e, sqlite3_stmt* s, int column, bool safe) {
  switch (sqlite3_column_type(s, column)) {
    case SQLITE_INTEGER:
      if (safe) return bigInt(e, sqlite3_column_int64(s, column));
      return e.number(static_cast<double>(sqlite3_column_int64(s, column)));
    case SQLITE_FLOAT:
      return e.number(sqlite3_column_double(s, column));
    case SQLITE_TEXT: {
      const auto* text = reinterpret_cast<const char*>(sqlite3_column_text(s, column));
      return e.string(std::string_view(text ? text : "", sqlite3_column_bytes(s, column)));
    }
    case SQLITE_BLOB: {
      const auto* data = static_cast<const uint8_t*>(sqlite3_column_blob(s, column));
      return e.bytes(data, data ? sqlite3_column_bytes(s, column) : 0);
    }
    default:
      return e.null();
  }
}

// Binds `values` (with their `kinds`, see sqlite.h) to parameters 1..n.
void bindValues(js::Engine& e, sqlite3* db, sqlite3_stmt* s, const js::Value& values, const std::string& kinds) {
  sqlite3_reset(s);
  sqlite3_clear_bindings(s);
  if (static_cast<int>(kinds.size()) > sqlite3_bind_parameter_count(s)) {
    fail("RangeError", "Too many parameter values were provided");
  }
  for (size_t i = 0; i < kinds.size(); ++i) {
    const int index = static_cast<int>(i) + 1;
    js::Value v = e.get(values, std::to_string(i));
    int rc = SQLITE_OK;
    switch (kinds[i]) {
      case 'n':
        rc = sqlite3_bind_null(s, index);
        break;
      case 'd':
        rc = sqlite3_bind_double(s, index, e.toNumber(v));
        break;
      case 'i': {
        const std::string digits = e.toString(v);
        errno = 0;
        char* end = nullptr;
        const long long n = std::strtoll(digits.c_str(), &end, 10);
        if (errno == ERANGE || end == digits.c_str() || *end != '\0') {
          fail("RangeError", "The bound string, buffer, or bigint is too big");
        }
        rc = sqlite3_bind_int64(s, index, n);
        break;
      }
      case 's': {
        const std::string text = e.toString(v);
        rc = sqlite3_bind_text64(s, index, text.data(), text.size(), SQLITE_TRANSIENT, SQLITE_UTF8);
        break;
      }
      case 'b': {
        const std::vector<uint8_t> data = e.toBytes(v);
        rc = sqlite3_bind_blob64(s, index, data.empty() ? "" : static_cast<const void*>(data.data()),
                                 data.size(), SQLITE_TRANSIENT);
        break;
      }
      default:
        fail("TypeError", "SQLite3 can only bind numbers, strings, bigints, buffers, and null");
    }
    if (rc == SQLITE_TOOBIG) fail("RangeError", "The bound string, buffer, or bigint is too big");
    if (rc == SQLITE_RANGE) fail("RangeError", "Too many parameter values were provided");
    if (rc != SQLITE_OK) dbError(db);
  }
}

// --- functions ---------------------------------------------------------------

using Fn = js::Value (*)(State&, js::Engine&, Args);

js::Value fnDirectory(State& st, js::Engine& e, Args) {
  return st.root.empty() ? e.null() : e.string(st.root);
}

js::Value fnOpen(State& st, js::Engine& e, Args a) {
  const std::string filename = e.toString(a.at(0));
  const bool readonly = e.toBoolean(a.at(1));
  const bool mustExist = e.toBoolean(a.at(2));
  const int timeout = toInt(e, a.at(3));
  const bool memory = memoryName(filename);
  const std::string path = memory ? filename : resolvePath(st, filename);
  const int flags = (readonly ? SQLITE_OPEN_READONLY
                              : mustExist ? SQLITE_OPEN_READWRITE
                                          : (SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE)) |
                    SQLITE_OPEN_NOMUTEX | (memory ? 0 : SQLITE_OPEN_NOFOLLOW);
  // native-rules #6: raw sqlite3 handle closed by hand on each path
  sqlite3* db = nullptr;
  const int rc = sqlite3_open_v2(path.c_str(), &db, flags, st.vfs.c_str());
  if (rc != SQLITE_OK) {
    const std::string message = db ? sqlite3_errmsg(db) : sqlite3_errstr(rc);
    const int code = db ? sqlite3_extended_errcode(db) : rc;
    sqlite3_close_v2(db);
    fail(codeName(code), message);
  }
  sqlite3_extended_result_codes(db, 1);
  sqlite3_busy_timeout(db, timeout);
  sqlite3_db_config(db, SQLITE_DBCONFIG_DEFENSIVE, 1, nullptr);
  const int id = st.next++;
  st.dbs[id] = db;
  return e.number(id);
}

js::Value fnClose(State& st, js::Engine& e, Args a) {
  st.close(toInt(e, a.at(0)));
  return e.undefined();
}

bool skipped(char c) { return c == ' ' || c == '\t' || c == '\n' || c == '\r' || c == '\f' || c == ';'; }

js::Value fnExec(State& st, js::Engine& e, Args a) {
  sqlite3* db = st.db(toInt(e, a.at(0)));
  const std::string sql = e.toString(a.at(1));
  const char* p = sql.c_str();
  for (;;) {
    while (skipped(*p)) ++p;
    // native-rules #6: raw sqlite3_stmt finalized by hand, leaks if step throws
    sqlite3_stmt* s = nullptr;
    const char* tail = nullptr;
    if (sqlite3_prepare_v2(db, p, -1, &s, &tail) != SQLITE_OK) dbError(db);
    p = tail;
    if (s == nullptr) break;
    int rc;
    do rc = sqlite3_step(s);
    while (rc == SQLITE_ROW);
    if (sqlite3_finalize(s) != SQLITE_OK) dbError(db);
  }
  return e.undefined();
}

// Whether `tail`, the rest of a prepared string, holds only space and comments.
bool onlyComments(const char* tail) {
  while (char c = *tail) {
    if (skipped(c)) {
      ++tail;
    } else if (c == '/' && tail[1] == '*') {
      tail += 2;
      while (*tail && !(tail[0] == '*' && tail[1] == '/')) ++tail;
      if (*tail) tail += 2;
    } else if (c == '-' && tail[1] == '-') {
      tail += 2;
      while (*tail && *tail != '\n') ++tail;
    } else {
      return false;
    }
  }
  return true;
}

js::Value fnPrepare(State& st, js::Engine& e, Args a) {
  const int dbId = toInt(e, a.at(0));
  sqlite3* db = st.db(dbId);
  const std::string sql = e.toString(a.at(1));
  const bool pragma = a.size() > 2 && e.toBoolean(a.at(2));
  // native-rules #6: raw sqlite3_stmt finalized by hand on each path
  sqlite3_stmt* s = nullptr;
  const char* tail = nullptr;
  if (sqlite3_prepare_v3(db, sql.c_str(), static_cast<int>(sql.size()) + 1,
                         pragma ? 0 : SQLITE_PREPARE_PERSISTENT, &s, &tail) != SQLITE_OK) {
    dbError(db);
  }
  if (s == nullptr) fail("RangeError", "The supplied SQL string contains no statements");
  if (!onlyComments(tail)) {
    sqlite3_finalize(s);
    fail("RangeError", "The supplied SQL string contains more than one statement");
  }
  const int id = st.next++;
  const int columnCount = sqlite3_column_count(s);
  st.statements[id] = Statement{s, dbId, columnCount >= 1 || pragma};

  js::Value info = e.object();
  e.set(info, "id", e.number(id));
  e.set(info, "reader", e.boolean(columnCount >= 1 || pragma));
  e.set(info, "readonly", e.boolean(sqlite3_stmt_readonly(s) != 0));
  js::Value params = newArray(e);
  for (int i = 1, n = sqlite3_bind_parameter_count(s); i <= n; ++i) {
    const char* name = sqlite3_bind_parameter_name(s, i);
    e.set(params, std::to_string(i - 1), name ? e.string(name) : e.null());
  }
  e.set(info, "params", params);
  js::Value columns = newArray(e);
  for (int i = 0; i < columnCount; ++i) {
    const char* name = sqlite3_column_name(s, i);
    e.set(columns, std::to_string(i), e.string(name ? name : ""));
  }
  e.set(info, "columns", columns);
  return info;
}

js::Value fnRun(State& st, js::Engine& e, Args a) {
  Statement& stmt = st.statement(toInt(e, a.at(0)));
  sqlite3* db = st.db(stmt.db);
  bindValues(e, db, stmt.handle, a.at(1), e.toString(a.at(2)));
  const bool safe = e.toBoolean(a.at(3));
  const sqlite3_int64 before = sqlite3_total_changes64(db);
  sqlite3_step(stmt.handle);
  if (sqlite3_reset(stmt.handle) != SQLITE_OK) dbError(db);
  const sqlite3_int64 changes = sqlite3_total_changes64(db) == before ? 0 : sqlite3_changes64(db);
  const sqlite3_int64 rowid = sqlite3_last_insert_rowid(db);
  js::Value info = e.object();
  e.set(info, "changes", e.number(static_cast<double>(static_cast<int>(changes))));
  e.set(info, "lastInsertRowid", safe ? bigInt(e, rowid) : e.number(static_cast<double>(rowid)));
  return info;
}

js::Value fnQuery(State& st, js::Engine& e, Args a) {
  Statement& stmt = st.statement(toInt(e, a.at(0)));
  sqlite3* db = st.db(stmt.db);
  if (!stmt.reader) fail("TypeError", "This statement does not return data. Use run() instead");
  bindValues(e, db, stmt.handle, a.at(1), e.toString(a.at(2)));
  const bool safe = e.toBoolean(a.at(3));
  const int limit = toInt(e, a.at(4));
  js::Value out = newArray(e);
  size_t index = 0;
  int rows = 0;
  while ((limit <= 0 || rows < limit) && sqlite3_step(stmt.handle) == SQLITE_ROW) {
    // sqlite3_step may automatically recompile after a schema change.
    const int columns = sqlite3_column_count(stmt.handle);
    for (int c = 0; c < columns; ++c) e.set(out, std::to_string(index++), cell(e, stmt.handle, c, safe));
    ++rows;
  }
  if (sqlite3_reset(stmt.handle) != SQLITE_OK) dbError(db);
  js::Value columns = newArray(e);
  for (int c = 0, n = sqlite3_column_count(stmt.handle); c < n; ++c) {
    const char* name = sqlite3_column_name(stmt.handle, c);
    e.set(columns, std::to_string(c), e.string(name ? name : ""));
  }
  e.set(out, "columns", columns);
  return out;
}

js::Value fnColumns(State& st, js::Engine& e, Args a) {
  Statement& stmt = st.statement(toInt(e, a.at(0)));
  if (!stmt.reader) fail("TypeError", "The columns() method is only for statements that return data");
  js::Value out = newArray(e);
  size_t index = 0;
  const auto text = [&](const char* s) { return s ? e.string(s) : e.null(); };
  for (int c = 0, n = sqlite3_column_count(stmt.handle); c < n; ++c) {
    e.set(out, std::to_string(index++), text(sqlite3_column_name(stmt.handle, c)));
    e.set(out, std::to_string(index++), text(sqlite3_column_origin_name(stmt.handle, c)));
    e.set(out, std::to_string(index++), text(sqlite3_column_table_name(stmt.handle, c)));
    e.set(out, std::to_string(index++), text(sqlite3_column_database_name(stmt.handle, c)));
    e.set(out, std::to_string(index++), text(sqlite3_column_decltype(stmt.handle, c)));
  }
  return out;
}

js::Value fnFinalize(State& st, js::Engine& e, Args a) {
  auto it = st.statements.find(toInt(e, a.at(0)));
  if (it != st.statements.end()) {
    sqlite3_finalize(it->second.handle);
    st.statements.erase(it);
  }
  return e.undefined();
}

js::Value fnInTransaction(State& st, js::Engine& e, Args a) {
  auto it = st.dbs.find(toInt(e, a.at(0)));
  return e.boolean(it != st.dbs.end() && sqlite3_get_autocommit(it->second) == 0);
}

js::Value fnLoadExtension(State& st, js::Engine& e, Args a) {
  sqlite3* db = st.db(toInt(e, a.at(0)));
  const std::string name = e.toString(a.at(1));
  if (name != "vec0") {
    fail("SQLITE_ERROR", "only the built-in sqlite-vec extension (\"vec0\") can be loaded, not " + name);
  }
  char* error = nullptr;
  if (sqlite3_vec_init(db, &error, nullptr) != SQLITE_OK) {
    const std::string message = error ? error : "sqlite-vec failed to initialize";
    sqlite3_free(error);
    fail("SQLITE_ERROR", message);
  }
  return e.undefined();
}

}  // namespace

void installSqlite(js::Engine& engine, const js::Value& object, const HostOptions& options) {
  // native-rules #1: state shared by the sqlite host functions, no justification
  auto state = std::make_shared<State>();
  if (!options.sqliteDirectory.empty()) {
    std::error_code ec;
    const fs::path root = fs::canonical(options.sqliteDirectory, ec);
    if (!ec && fs::is_directory(root, ec)) {
      state->root = root.string();
      fs::path named = fs::path(options.sqliteDirectory).lexically_normal();
      if (!named.has_filename()) named = named.parent_path();
      if (named.is_absolute()) state->given = named.string();
    } else {
      std::fprintf(stderr, "[sqlite] granted directory %s does not exist; in-memory only\n",
                   options.sqliteDirectory.c_str());
    }
  }
  state->vfs = sandboxVfs(state->root);

  const auto add = [&](const char* name, unsigned arity, Fn fn) {
    engine.set(object, name, engine.function(name, arity, [state, fn](js::Engine& e, Args a) {
                 return fn(*state, e, a);
               }));
  };
  add("directory", 0, fnDirectory);
  add("open", 4, fnOpen);
  add("close", 1, fnClose);
  add("exec", 2, fnExec);
  add("prepare", 3, fnPrepare);
  add("run", 4, fnRun);
  add("query", 5, fnQuery);
  add("columns", 1, fnColumns);
  add("finalize", 1, fnFinalize);
  add("inTransaction", 1, fnInTransaction);
  add("loadExtension", 2, fnLoadExtension);
}

}  // namespace gr::host
