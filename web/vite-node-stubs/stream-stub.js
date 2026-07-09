// Real `node:stream` substitute for the browser bundles, backed by
// readable-stream (the userland port of Node's streams, browser-ready).
//
// An empty stub is not enough here: memfs — pulled in by the QuickJS sandbox
// behind the universal Code node — subclasses `stream.Readable`/`Writable` at
// module scope (via @jsonjoy.com/fs-node-builtins), and an undefined super
// constructor throws while the chunk evaluates, taking the whole browser
// runner registry down with it.
export {
  Readable,
  Writable,
  Duplex,
  Transform,
  PassThrough,
  Stream,
  pipeline,
  finished
} from "readable-stream";
export { default } from "readable-stream";
