// The sqlite-vec npm package in the guest. sqlite-vec 0.1.9 is compiled into
// the runner (src/host/sqlite.cpp), so `load(db)` registers it on a
// better-sqlite3 database from guest/host/sqlite.mjs instead of loading a
// shared library. guest/build.mjs maps "sqlite-vec" onto this module.

/** The name the host's loadExtension accepts for the built-in extension. */
export function getLoadablePath() {
  return "vec0";
}

export function load(db) {
  db.loadExtension(getLoadablePath());
}
