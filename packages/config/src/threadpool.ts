/**
 * Size the libuv thread pool before anything uses it.
 *
 * libuv runs file system calls, DNS lookups, crypto, zlib and native addon
 * work (node-av encodes and decodes, sharp) on one pool, four threads unless
 * `UV_THREADPOOL_SIZE` says otherwise. A media encode holds a thread for as
 * long as its muxer writes, so a few encodes at once leave every other file
 * read waiting behind them. libuv reads the size once, when the first job is
 * queued, so a process entry imports this module before any other.
 * An explicit `UV_THREADPOOL_SIZE` wins.
 *
 * Importing first is not enough where something runs before the entry's own
 * code: a loader such as tsx, or the esbuild backend bundle, whose external
 * native imports evaluate first. Their launchers set the variable in the
 * child's environment instead (the Dockerfile, Electron's backend spawn,
 * scripts/dev-server.mjs).
 */

/** Threads when the environment names none. libuv's ceiling is 1024. */
export const DEFAULT_THREADPOOL_SIZE = 128;

if (!process.env["UV_THREADPOOL_SIZE"]) {
  process.env["UV_THREADPOOL_SIZE"] = String(DEFAULT_THREADPOOL_SIZE);
}
