// The `sqlite` host capability: SQLite 3 with the sqlite-vec extension,
// compiled into the runner. guest/host/sqlite.mjs builds the
// better-sqlite3 API on it, and guest/host/sqlite-vec.mjs the sqlite-vec
// package's `load(db)`.
//
// Database files live only in HostOptions::sqliteDirectory. Without it, the
// guest can open in-memory databases and nothing else. A sandbox VFS checks
// every file SQLite opens, deletes or probes (the database, its journal and
// WAL, ATTACH and VACUUM INTO targets) against that directory after SQLite
// has resolved symbolic links.
//
// Functions on __host.sqlite (ids are numbers; errors throw an Error whose
// message starts with the SQLite result code name, "TypeError: " or
// "RangeError: "):
//   directory() -> string | null           the granted directory
//   open(filename, readonly, fileMustExist, timeoutMs) -> db
//   close(db)
//   exec(db, sql)                          runs every statement in `sql`
//   prepare(db, sql, pragma) -> {id, reader, readonly, params, columns}
//       params: name of each parameter (with its prefix) or null, in order
//   run(stmt, values, kinds, safeIntegers) -> {changes, lastInsertRowid}
//   query(stmt, values, kinds, safeIntegers, limit) -> flat array of cells
//       array.columns: current column names, including automatic recompilation
//   columns(stmt) -> flat array of [name, column, table, database, type]
//   finalize(stmt)
//   inTransaction(db) -> boolean
//   loadExtension(db, name)                only "vec0", the built-in sqlite-vec
//
// `values` holds one entry per parameter and `kinds` one character per entry:
// n null, d number, i integer as a decimal string (a BigInt), s string,
// b bytes. Cells are null, number, string, Uint8Array, or BigInt for
// integers when safeIntegers is true.
#pragma once

#include "host/capabilities.h"

namespace gr::host {

void installSqlite(js::Engine& engine, const js::Value& object,
                   const HostOptions& options);

}  // namespace gr::host
