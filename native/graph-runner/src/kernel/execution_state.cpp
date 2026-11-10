#include "kernel/execution_state.h"
#include "kernel/wire.h"
#include "host/paths.h"
#include <sqlite3.h>
#include <cstdint>
#include <cmath>
#include <iomanip>
#include <sstream>
#include <stdexcept>

namespace gr {
namespace {
struct Statement {
  sqlite3_stmt* value = nullptr;
  explicit Statement(sqlite3* db, const char* sql) {
    if (sqlite3_prepare_v2(db, sql, -1, &value, nullptr) != SQLITE_OK) {
      throw std::runtime_error(sqlite3_errmsg(db));
    }
  }
  ~Statement() { sqlite3_finalize(value); }
  void bind(int i, const std::string& v) {
    if (sqlite3_bind_text(value, i, v.data(), static_cast<int>(v.size()), SQLITE_TRANSIENT) != SQLITE_OK) {
      throw std::runtime_error("state text binding failed");
    }
  }
  void number(int i, long long v) { sqlite3_bind_int64(value, i, v); }
  bool next() {
    int rc = sqlite3_step(value);
    if (rc != SQLITE_ROW && rc != SQLITE_DONE) {
      throw std::runtime_error(sqlite3_errmsg(sqlite3_db_handle(value)));
    }
    return rc == SQLITE_ROW;
  }
  std::string text(int i) const {
    auto p = sqlite3_column_text(value, i);
    return p ? std::string(reinterpret_cast<const char*>(p), sqlite3_column_bytes(value, i)) : "";
  }
};
long long nowMs() {
  return std::chrono::duration_cast<std::chrono::milliseconds>(
      std::chrono::system_clock::now().time_since_epoch()).count();
}
Json canonical(const Json& value) {
  if (value.is_object()) {
    std::map<std::string, Json> sorted;
    for (const auto& [k, v] : value.items()) sorted[k] = canonical(v);
    Json out = Json::object();
    for (const auto& [k, v] : sorted) out[k] = v;
    return out;
  }
  if (value.is_array()) {
    Json out = Json::array();
    for (const auto& v : value) out.push_back(canonical(v));
    return out;
  }
  return value;
}
}
struct ExecutionState::Impl {
  sqlite3* db = nullptr;
  ~Impl() { if (db) sqlite3_close_v2(db); }
  void exec(const char* sql) {
    if (sqlite3_exec(db, sql, nullptr, nullptr, nullptr) != SQLITE_OK) {
      throw std::runtime_error(sqlite3_errmsg(db));
    }
  }
};
ExecutionState::ExecutionState(const std::string& directory) : impl_(std::make_unique<Impl>()) {
  std::string path = ":memory:";
  if (!directory.empty()) {
    auto roots = host::canonicalRoots({{directory, true}});
    if (roots.empty()) throw std::runtime_error("State directory grant must exist");
    path = host::confine(roots, roots.front().dir, "execution-state.sqlite",
                        host::Access::Write, "open", true).real;
  }
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_NOMUTEX | SQLITE_OPEN_NOFOLLOW;
  if (sqlite3_open_v2(path.c_str(), &impl_->db, flags, nullptr) != SQLITE_OK) {
    throw std::runtime_error("Cannot open execution state");
  }
  sqlite3_busy_timeout(impl_->db, 1000);
  impl_->exec("PRAGMA synchronous=FULL; CREATE TABLE IF NOT EXISTS result_cache(key TEXT PRIMARY KEY,value TEXT NOT NULL,expires INTEGER);"
              "CREATE TABLE IF NOT EXISTS durable_messages(id TEXT PRIMARY KEY,run TEXT,node TEXT,handle TEXT,seq INTEGER,payload TEXT,status TEXT,created INTEGER,consumed INTEGER);"
              "CREATE INDEX IF NOT EXISTS durable_address ON durable_messages(run,node,handle,seq);");
}
ExecutionState::~ExecutionState() = default;
std::string ExecutionState::cacheKey(const std::string& user, const std::string& type, const Json& props) {
  // dumpWire writes bytes as base64, so the key depends on their content.
  return user + ":" + type + ":" + dumpWire(canonical(props), Json::error_handler_t::replace);
}
std::optional<Json> ExecutionState::cached(const std::string& key) {
  Statement q(impl_->db, "SELECT value,expires FROM result_cache WHERE key=?");
  q.bind(1,key);
  if (!q.next()) return std::nullopt;
  if (sqlite3_column_type(q.value,1) != SQLITE_NULL && nowMs() > sqlite3_column_int64(q.value,1)) {
    invalidate(key);
    return std::nullopt;
  }
  return Json::parse(q.text(0));
}
void ExecutionState::cache(const std::string& key, const Json& value, double ttl) {
  Statement q(impl_->db,"INSERT OR REPLACE INTO result_cache VALUES(?,?,?)");
  // The store holds the bytes themselves, as base64 text.
  q.bind(1,key); q.bind(2,dumpWire(value));
  if (ttl != 0) {
    if (!std::isfinite(ttl) || std::abs(ttl) > 1e12) throw std::runtime_error("Invalid cache TTL");
    q.number(3,nowMs() + static_cast<long long>(ttl * 1000));
  }
  q.next();
}
void ExecutionState::invalidate(const std::string& key) {
  Statement q(impl_->db,"DELETE FROM result_cache WHERE key=?"); q.bind(1,key); q.next();
}
std::string ExecutionState::messageId(const std::string& run, const std::string& node,
                                     const std::string& handle, long long seq) {
  std::string key = run + ":" + node + ":" + handle + ":" + std::to_string(seq);
  uint32_t h1 = 0x811c9dc5, h2 = 0xcbf29ce4;
  auto unit = [&](uint32_t u) {
    for (uint32_t b : {u & 255, (u >> 8) & 255}) {
      h1 = (h1 ^ b) * 16777619u; h2 = (h2 ^ b) * 16777619u;
    }
  };
  for (size_t i = 0; i < key.size();) {
    uint32_t c = static_cast<unsigned char>(key[i++]);
    int more = c < 128 ? 0 : c < 224 ? 1 : c < 240 ? 2 : 3;
    if (more) c &= (1u << (6 - more)) - 1;
    for (int n = 0; n < more && i < key.size(); ++n) c = (c << 6) | (static_cast<unsigned char>(key[i++]) & 63);
    if (c > 65535) { c -= 65536; unit(0xd800 + (c >> 10)); unit(0xdc00 + (c & 1023)); }
    else unit(c);
  }
  std::ostringstream out;
  out << std::hex << std::setfill('0') << std::setw(8) << h1 << std::setw(8) << h2;
  return out.str();
}
long long ExecutionState::maxSequence(const std::string& run, const std::string& node, const std::string& handle) {
  Statement q(impl_->db,"SELECT COALESCE(MAX(seq),0) FROM durable_messages WHERE run=? AND node=? AND handle=?");
  q.bind(1,run); q.bind(2,node); q.bind(3,handle); q.next(); return sqlite3_column_int64(q.value,0);
}
Json ExecutionState::append(const std::string& run, const std::string& node, const std::string& handle,
                            const Json& payload, const std::optional<std::string>& id) {
  impl_->exec("BEGIN IMMEDIATE");
  try {
    long long seq = maxSequence(run,node,handle) + 1;
    std::string finalId = id.value_or(messageId(run,node,handle,seq));
    Statement insert(impl_->db,"INSERT OR IGNORE INTO durable_messages VALUES(?,?,?,?,?,?, 'pending',?,NULL)");
    insert.bind(1,finalId); insert.bind(2,run); insert.bind(3,node); insert.bind(4,handle);
    insert.number(5,seq); insert.bind(6,dumpWire(payload)); insert.number(7,nowMs()); insert.next();
    Statement q(impl_->db,"SELECT run,node,handle,seq,payload,status FROM durable_messages WHERE id=?");
    q.bind(1,finalId); q.next();
    Json result = {{"messageId",finalId},{"runId",q.text(0)},{"nodeId",q.text(1)},
      {"handle",q.text(2)},{"seq",sqlite3_column_int64(q.value,3)},{"payload",Json::parse(q.text(4))},{"status",q.text(5)}};
    impl_->exec("COMMIT"); return result;
  } catch (...) { impl_->exec("ROLLBACK"); throw; }
}
std::vector<Json> ExecutionState::pending(const std::string& run, const std::string& node,
                                         const std::optional<std::string>& handle, int limit, long long minSeq) {
  const char* query = handle
    ? "SELECT id,handle,seq,payload FROM durable_messages WHERE run=? AND node=? AND (? IS NULL OR handle=?) AND status='pending' AND seq>=? ORDER BY seq,rowid LIMIT ?"
    : "SELECT id,handle,seq,payload FROM durable_messages WHERE run=? AND node=? AND (? IS NULL OR handle=?) AND status='pending' AND seq>=? ORDER BY rowid LIMIT ?";
  Statement q(impl_->db,query);
  q.bind(1,run); q.bind(2,node); if (handle) { q.bind(3,*handle); q.bind(4,*handle); }
  q.number(5,minSeq); q.number(6,std::max(0,limit));
  std::vector<Json> result;
  while(q.next()) result.push_back({{"messageId",q.text(0)},{"handle",q.text(1)},
    {"seq",sqlite3_column_int64(q.value,2)},{"payload",Json::parse(q.text(3))}});
  return result;
}
void ExecutionState::acknowledge(const std::string& id) {
  Statement q(impl_->db,"UPDATE durable_messages SET status='consumed',consumed=? WHERE id=?");
  q.number(1,nowMs()); q.bind(2,id); q.next();
}
int ExecutionState::cleanup(const std::string& run, const std::string& node,
                           const std::string& handle, long long seq) {
  Statement q(impl_->db,"DELETE FROM durable_messages WHERE run=? AND node=? AND handle=? AND status='consumed' AND seq<?");
  q.bind(1,run); q.bind(2,node); q.bind(3,handle); q.number(4,seq); q.next();
  return sqlite3_changes(impl_->db);
}
} // namespace gr
