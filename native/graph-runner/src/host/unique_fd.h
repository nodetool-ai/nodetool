// An owned file descriptor, for the file and asset hosts.
#pragma once

#include "host/platform_fs.h"
#include <cerrno>
#include <utility>

namespace gr::host {

// Closes its descriptor in the destructor. A descriptor has exactly one
// owner: moving hands it over and leaves the source empty.
//
// Thread affinity: none, one thread at a time. It can move between threads
// with the job or payload that holds it.
class UniqueFd {
public:
  UniqueFd() = default;
  explicit UniqueFd(int fd) : fd_(fd) {}
  UniqueFd(UniqueFd&& other) noexcept : fd_(std::exchange(other.fd_, -1)) {}
  UniqueFd& operator=(UniqueFd&& other) noexcept {
    if (this != &other) {
      reset();
      fd_ = std::exchange(other.fd_, -1);
    }
    return *this;
  }
  UniqueFd(const UniqueFd&) = delete;
  UniqueFd& operator=(const UniqueFd&) = delete;
  ~UniqueFd() { reset(); }

  int get() const { return fd_; }
  int release() { return std::exchange(fd_, -1); }
  explicit operator bool() const { return fd_ >= 0; }
  // Closes now. Not retried on EINTR: the descriptor may already be freed.
  void reset() {
    if (fd_ >= 0) fsapi::close(std::exchange(fd_, -1));
  }
  // Closes now and returns close()'s errno, or 0.
  int close() {
    if (fd_ < 0) return 0;
    return fsapi::close(std::exchange(fd_, -1)) == 0 ? 0 : errno;
  }

private:
  int fd_ = -1;
};

}  // namespace gr::host
