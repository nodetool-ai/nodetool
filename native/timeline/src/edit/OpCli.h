#pragma once

// `timeline-ops`: one call of a native edit function, for the
// conformance script. Reads `{"fn": name, "args": [...]}` on stdin and prints
// `{"result": ...}` or `{"error": message}`. The arguments are the
// TypeScript function's, with sets as arrays.

namespace nt::edit {

int runOpCli();

}  // namespace nt::edit
