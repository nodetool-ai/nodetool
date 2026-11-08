// Submission snapshots (docs/plans/graph-runner-async-host.md, section 4.7).
//
// A host function that submits a native job copies the JavaScript arguments
// the job needs into owned native data first, on the worker, before it
// returns to JavaScript. The job keeps only these copies and never a pointer
// into JavaScript storage, so guest code that mutates, detaches or resizes a
// buffer after the call cannot reach the job.
#pragma once

#include "js/engine.h"

#include <cstdint>
#include <string>
#include <string_view>
#include <vector>

namespace gr {

// The bytes an ArrayBuffer or typed array covers at the call. Throws
// std::invalid_argument, naming the argument `name`, for another value and
// for a detached or out-of-bounds buffer. A typed array over a
// SharedArrayBuffer is copied like any view. A SharedArrayBuffer itself is
// rejected, as another value.
std::vector<uint8_t> snapshotBytes(js::Engine& engine, const js::Value& value, std::string_view name);

// A string argument. Throws std::invalid_argument for another type.
std::string snapshotString(js::Engine& engine, const js::Value& value, std::string_view name);

// An options object as JSON text, through JSON.stringify. undefined and null
// give "{}". Throws std::invalid_argument for a value that is not an object,
// and passes on a JsError from a toJSON method or getter.
std::string snapshotOptions(js::Engine& engine, const js::Value& value, std::string_view name);

}  // namespace gr
