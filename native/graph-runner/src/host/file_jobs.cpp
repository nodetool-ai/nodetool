#include "host/platform_fs.h"
#include "host/file_jobs.h"

#include "host/paths.h"

#include <algorithm>
#include <cerrno>
#include <fcntl.h>
#include <stdexcept>

using nodetool::jobs::JobOutcome;

namespace gr::host {
namespace {

// Bytes read between two stop checks.
constexpr size_t kReadChunk = size_t(1) << 20;
// The buffer that measures a file that grew.
constexpr size_t kMeasureChunk = size_t(64) << 10;

// pread() retried on EINTR. Returns the count, or -1 with errno set.
fsapi::Count preadFully(int fd, uint8_t* data, size_t size, fsapi::Offset offset) {
  fsapi::Count n;
  do {
    n = fsapi::pread(fd, data, size, offset);
  } while (n < 0 && errno == EINTR);
  return n;
}

// Thread affinity: the I/O lane thread that runs it, or the worker in inline
// mode. Ownership: unique, through its SubmittedJob. Owns the descriptor
// until it hands it on in its result or is destroyed.
class ReadAllJob final : public nodetool::jobs::NativeJob {
public:
  explicit ReadAllJob(OpenedFile file) : file_(std::move(file)) {}

  // The output is reserved before the read. The buffer that measures growth
  // is workspace.
  nodetool::jobs::JobCost cost() const override { return {file_.path.size(), file_.size, kMeasureChunk}; }

  JobOutcome run(std::stop_token stop) override {
    if (stop.stop_requested()) return JobOutcome::stopped();
    // Allocated once, at the reserved size, so no append can pass it.
    std::vector<uint8_t> out(static_cast<size_t>(file_.size));
    size_t got = 0;
    while (got < out.size()) {
      if (stop.stop_requested()) return JobOutcome::stopped();
      const size_t want = std::min(kReadChunk, out.size() - got);
      const fsapi::Count n = preadFully(file_.fd.get(), out.data() + got, want, static_cast<fsapi::Offset>(got));
      if (n < 0) throwErrno(errno, "read", file_.path);
      if (n == 0) break;
      got += size_t(n);
    }
    if (got < out.size()) {
      out.resize(got);
      return JobOutcome::value(std::make_unique<FileBytes>(std::move(out)));
    }
    // Read to the reservation: anything past it means the file grew.
    uint8_t probe[kMeasureChunk];
    uint64_t total = got;
    for (;;) {
      if (stop.stop_requested()) return JobOutcome::stopped();
      const fsapi::Count n = preadFully(file_.fd.get(), probe, sizeof probe, static_cast<fsapi::Offset>(total));
      if (n < 0) throwErrno(errno, "read", file_.path);
      if (n == 0) break;
      total += uint64_t(n);
      if (total > kMaxReadBytes) throw FsError("EFBIG", "read", file_.path);
    }
    if (total == got) return JobOutcome::value(std::make_unique<FileBytes>(std::move(out)));
    // Freed here, on the lane, before the descriptor travels back.
    std::vector<uint8_t>().swap(out);
    auto grown = std::make_unique<OpenedFile>(std::move(file_));
    grown->size = total;
    return JobOutcome::value(std::move(grown));
  }

private:
  OpenedFile file_;
};

}  // namespace

OpenedFile openRegularFile(const std::string& real, const std::string& path) {
  // NONBLOCK keeps a FIFO from stalling the open before its type is checked.
  UniqueFd fd(fsapi::open(real.c_str(), O_RDONLY | O_NOFOLLOW | O_CLOEXEC | O_NONBLOCK));
  if (!fd) throwErrno(errno, "open", path);
  fsapi::FileStat st {};
  if (fsapi::fstat(fd.get(), &st) != 0) throwErrno(errno, "fstat", path);
  if (S_ISDIR(st.st_mode)) throw FsError("EISDIR", "read", path);
  if (!S_ISREG(st.st_mode)) throw FsError("EACCES", "open", path, "not a regular file");
  // A hard link can alias a file outside the roots.
  if (st.st_nlink > 1) throw FsError("EACCES", "open", path, "hard-linked file");
  if (uint64_t(st.st_size) > kMaxReadBytes) throw FsError("EFBIG", "read", path);
  OpenedFile file;
  file.fd = std::move(fd);
  file.size = uint64_t(st.st_size);
  file.path = path;
  return file;
}

std::unique_ptr<nodetool::jobs::NativeJob> makeReadAllJob(OpenedFile file) {
  return std::make_unique<ReadAllJob>(std::move(file));
}

ResultConverter wholeFileConverter(std::shared_ptr<RunBinding> binding) {
  return [binding](ResultConversion& conversion) -> js::Value {
    nodetool::jobs::JobPayload* payload = conversion.payload();
    if (!payload) return conversion.engine().null();
    if (auto* bytes = dynamic_cast<FileBytes*>(payload)) return conversion.adoptBytes(std::move(bytes->bytes));
    auto* opened = dynamic_cast<OpenedFile*>(payload);
    if (!opened) throw std::logic_error("a whole-file read delivered an unexpected payload");
    if (opened->attempts >= kReadAttempts) {
      throw FsError("EFBIG", "read", opened->path, "the file kept growing while it was read");
    }
    AsyncRun* run = binding->run();
    nodetool::jobs::JobExecutor* io = binding->io();
    if (!run || !io) throw std::runtime_error("the run of a whole-file read has ended");
    if (run->cancelled()) throw nodetool::jobs::JobAborted("The operation was aborted");
    OpenedFile next = std::move(*opened);
    ++next.attempts;
    // The descriptor moves into the next job. Its promise settles this one.
    return run->submit(*io, makeReadAllJob(std::move(next)), wholeFileConverter(binding), /*cancellable=*/true);
  };
}

}  // namespace gr::host
