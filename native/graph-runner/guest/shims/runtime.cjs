// @nodetool-ai/runtime and its subpaths in the default guest profile. CommonJS
// so that a named import the guest runtime lacks reads as undefined instead
// of failing the build; guest/host/runtime.mjs holds the implementation.
module.exports = require("../host/runtime.mjs");
