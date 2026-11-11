// Native jobs shared by the file and asset hosts (files.cpp, assets.cpp):
// their payloads, a job with a fixed cost, and the two-step whole-file read
// (docs/plans/graph-runner-async-host.md, sections 4.7 and 4.8).
//
// A whole-file read cannot know its output size at submission, and its
// admission charge must cover its output before it runs (section 4.7). It
// therefore runs as two jobs. The first, submitted by the host function,
// opens the file on the I/O lane, checks it and reads its size. Its result,
// an OpenedFile that owns the descriptor, reaches the worker, whose
// converter submits the second job with the size as its reserved output.
// The second reads at most that many bytes. A file that grew after the size
// was read is never read past its reservation: the job measures it and hands
// the descriptor back, and the converter submits another read reserving the
// new size, up to kReadAttempts reads in all.
#pragma once

#include "host/unique_fd.h"
#include "kernel/async_jobs.h"

#include <cstdint>
#include <memory>
#include <stop_token>
#include <string>
#include <utility>
#include <vector>

namespace gr::host {

// The largest file a whole-file read returns, as the synchronous readFile.
constexpr uint64_t kMaxReadBytes = uint64_t(1) << 30;
// Reads a growing file is given before it fails with EFBIG.
constexpr unsigned kReadAttempts = 3;
// The reserved output of a host function that returns a path or a small
// JSON object: PATH_MAX and the JSON around it.
constexpr uint64_t kMetadataBytes = 8 * 1024;
// The most JSON a directory or asset listing may produce.
constexpr uint64_t kMaxListingBytes = uint64_t(16) << 20;

// A Value payload holding a string, converted to a JavaScript string.
//
// Thread affinity: none. Created on the job's thread, it travels in its
// JobResult to the worker.
struct TextResult final : nodetool::jobs::JobPayload {
  explicit TextResult(std::string t) : text(std::move(t)) {}
  std::string text;
};

// A Value payload holding bytes, converted to a Uint8Array without a copy.
//
// Thread affinity: as TextResult.
struct FileBytes final : nodetool::jobs::JobPayload {
  explicit FileBytes(std::vector<uint8_t> b) : bytes(std::move(b)) {}
  std::vector<uint8_t> bytes;
};

// An open regular file and the size its next read reserves. The payload of
// the first step of a whole-file read, and of a read that found the file
// grown. It is the descriptor's only owner: the converter moves the
// descriptor into the next job, and a payload destroyed unconverted, such as
// one delivered after its run ended, closes it on the destroying thread.
//
// Thread affinity: one thread at a time, moving with its job or result.
struct OpenedFile final : nodetool::jobs::JobPayload {
  UniqueFd fd;
  uint64_t size = 0;
  // The path or key as the guest named it, for error messages.
  std::string path;
  // Reads already made of this file.
  unsigned attempts = 0;
};

// A job that runs `work(stop)` once and reports `cost` to the admission
// ledger. A stop requested before it starts ends it as Stopped. A throw
// fails it with the exception's message. `work` owns its inputs and is
// destroyed with the job, on the executor that ran or dropped it.
template <class F>
std::unique_ptr<nodetool::jobs::NativeJob> makeCostedJob(nodetool::jobs::JobCost cost, F work) {
  // Thread affinity: the executor thread that runs it, one call at a time.
  struct Job final : nodetool::jobs::NativeJob {
    Job(nodetool::jobs::JobCost c, F f) : cost_(c), work_(std::move(f)) {}
    nodetool::jobs::JobCost cost() const override { return cost_; }
    nodetool::jobs::JobOutcome run(std::stop_token stop) override {
      if (stop.stop_requested()) return nodetool::jobs::JobOutcome::stopped();
      return work_(stop);
    }
    nodetool::jobs::JobCost cost_;
    F work_;
  };
  return std::make_unique<Job>(cost, std::move(work));
}

// The second step of a whole-file read: reads `file` from offset 0, at most
// file.size bytes, and checks for more. Its Value is a FileBytes, or, when
// the file grew past file.size, an OpenedFile holding the descriptor and the
// size found. Its cost reserves file.size output bytes.
std::unique_ptr<nodetool::jobs::NativeJob> makeReadAllJob(OpenedFile file);

// The converter of both steps. Worker only. A FileBytes resolves with a
// Uint8Array. An OpenedFile submits the next read to the binding's I/O lane,
// cancellable, and resolves with that read's promise. A missing payload
// resolves with null, as an asset read of a missing key does. `binding` is
// the engine's run binding.
ResultConverter wholeFileConverter(std::shared_ptr<RunBinding> binding);

// The descriptor `path`, opened read-only without following a final
// symlink and without blocking on a FIFO, as an OpenedFile of its size.
// Throws FsError: EISDIR for a directory, EACCES for anything but a regular
// file or for a hard-linked file, EFBIG above kMaxReadBytes. `real` is the
// confined path, `path` the guest's spelling for messages.
OpenedFile openRegularFile(const std::string& real, const std::string& path);

}  // namespace gr::host
