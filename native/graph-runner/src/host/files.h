// Test seams of `__host.files` (files.cpp). Production installs none.
#pragma once

#include "js/engine.h"

#include <cstdint>
#include <functional>
#include <string_view>

namespace gr::host {

// Called on the job's thread at named points of the asynchronous file jobs:
//
//   "write:chunk"  after each chunk of a write; `value` is the bytes written
//   "copy:chunk"   after each chunk of an asynchronous copy; `value` is the
//                  bytes copied
//   "rm:batch"     after a recursive removal read a batch of names, while
//                  the batch's storage is live; `value` is the memory the
//                  removal holds
//
// It must be thread-safe: jobs of one install run on several lane threads.
struct FileJobHooks {
  std::function<void(std::string_view point, uint64_t value)> at;
};

// Makes every files capability installed on `engine` after this call use
// `hooks`. Worker only. Throws when hooks were set already.
void setFileJobHooks(js::Engine& engine, FileJobHooks hooks);

}  // namespace gr::host
