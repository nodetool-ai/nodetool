#pragma once
#include <atomic>
#include <cstdint>
namespace gr::host {
// The counter that makes each asset write's temporary file name unique in the
// process. Exposed so tests can predict the next name.
std::atomic<uint64_t>& tempSequence();
}
