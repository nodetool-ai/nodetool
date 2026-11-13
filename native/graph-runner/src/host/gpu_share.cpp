#include "host/gpu_share.h"

#include <algorithm>
#include <stdexcept>
#include <utility>

#ifndef _WIN32
#include <unistd.h>
#endif

namespace gr::host::gpu {

const char* shareBackendName(ShareBackend backend) {
  switch (backend) {
    case ShareBackend::Metal: return "Metal";
    case ShareBackend::D3D12: return "D3D12";
    case ShareBackend::Vulkan: return "Vulkan";
    case ShareBackend::None: break;
  }
  return "none";
}

NativeShareHandle::NativeShareHandle(NativeShareHandle&& other) noexcept
    : fd_(std::exchange(other.fd_, -1)),
      object_(std::exchange(other.object_, nullptr)),
      release_(std::exchange(other.release_, nullptr)) {}

NativeShareHandle& NativeShareHandle::operator=(NativeShareHandle&& other) noexcept {
  if (this != &other) {
    reset();
    fd_ = std::exchange(other.fd_, -1);
    object_ = std::exchange(other.object_, nullptr);
    release_ = std::exchange(other.release_, nullptr);
  }
  return *this;
}

NativeShareHandle::~NativeShareHandle() { reset(); }

NativeShareHandle NativeShareHandle::fromFd(int fd) {
  NativeShareHandle handle;
  handle.fd_ = fd;
  return handle;
}

NativeShareHandle NativeShareHandle::fromObject(void* object, void (*release)(void*)) {
  NativeShareHandle handle;
  handle.object_ = object;
  handle.release_ = release;
  return handle;
}

int NativeShareHandle::releaseFd() { return std::exchange(fd_, -1); }

void NativeShareHandle::reset() {
#ifndef _WIN32
  if (fd_ >= 0) ::close(fd_);
#endif
  fd_ = -1;
  if (object_ && release_) release_(object_);
  object_ = nullptr;
  release_ = nullptr;
}

FrameRing::FrameRing(size_t capacity) : capacity_(capacity), slots_(capacity) {
  if (capacity < 2) throw std::invalid_argument("a frame ring needs at least two slots");
}

bool FrameRing::check(size_t slot, State expected) {
  if (slot < slots_.size() && slots_[slot].state == expected) return true;
  ++stats_.ownershipFailures;
  return false;
}

std::optional<size_t> FrameRing::beginWrite() {
  std::lock_guard lock(mutex_);
  if (closed_) return std::nullopt;
  for (size_t i = 0; i < slots_.size(); ++i) {
    if (slots_[i].state != State::Free) continue;
    slots_[i].state = State::Writing;
    slots_[i].writeStart = std::chrono::steady_clock::now();
    return i;
  }
  ++stats_.framesDropped;
  return std::nullopt;
}

void FrameRing::setTexture(size_t slot, std::shared_ptr<SharedTexture> texture) {
  std::lock_guard lock(mutex_);
  if (!check(slot, State::Writing)) throw std::logic_error("setTexture on a slot that is not being written");
  Slot& s = slots_[slot];
  if (s.texture) {
    s.pastCpuTransfers += s.texture->cpuTransfers();
    ++stats_.resourcesRetired;
  }
  s.texture = std::move(texture);
  if (s.texture) ++stats_.resourcesCreated;
}

std::shared_ptr<SharedTexture> FrameRing::texture(size_t slot) const {
  std::lock_guard lock(mutex_);
  return slot < slots_.size() ? slots_[slot].texture : nullptr;
}

void FrameRing::publish(size_t slot, std::chrono::nanoseconds waited) {
  {
    std::lock_guard lock(mutex_);
    if (!check(slot, State::Writing)) throw std::logic_error("publish on a slot that is not being written");
    if (!slots_[slot].texture) {
      ++stats_.ownershipFailures;
      throw std::logic_error("publish on a slot without a texture");
    }
    for (Slot& other : slots_) {
      if (other.state != State::Ready) continue;
      other.state = State::Free;
      ++stats_.framesReplaced;
    }
    slots_[slot].state = State::Ready;
    slots_[slot].sequence = nextSequence_++;
    ++stats_.framesPublished;
    const auto ns = uint64_t(std::max<std::chrono::nanoseconds::rep>(0, waited.count()));
    stats_.syncWaitNanosTotal += ns;
    stats_.syncWaitNanosMax = std::max(stats_.syncWaitNanosMax, ns);
  }
  writable_.notify_all();
}

void FrameRing::abandon(size_t slot) {
  {
    std::lock_guard lock(mutex_);
    if (!check(slot, State::Writing)) return;
    slots_[slot].state = State::Free;
  }
  writable_.notify_all();
}

bool FrameRing::waitWritable(std::chrono::milliseconds timeout) {
  std::unique_lock lock(mutex_);
  writable_.wait_for(lock, timeout, [&] {
    return closed_ || std::any_of(slots_.begin(), slots_.end(),
                                  [](const Slot& s) { return s.state == State::Free; });
  });
  return !closed_ &&
         std::any_of(slots_.begin(), slots_.end(), [](const Slot& s) { return s.state == State::Free; });
}

bool FrameRing::waitConsumed(std::chrono::milliseconds timeout) {
  std::unique_lock lock(mutex_);
  auto consumed = [&] {
    return std::none_of(slots_.begin(), slots_.end(), [](const Slot& s) { return s.state == State::Ready; });
  };
  writable_.wait_for(lock, timeout, [&] { return closed_ || consumed(); });
  return !closed_ && consumed();
}

std::optional<FrameRing::Frame> FrameRing::present() {
  std::unique_lock lock(mutex_);
  if (closed_) return std::nullopt;
  Slot* ready = nullptr;
  for (Slot& s : slots_) {
    if (s.state == State::Ready) ready = &s;
  }
  if (!ready) {
    ++stats_.framesReused;
    return std::nullopt;
  }
  for (Slot& s : slots_) {
    if (s.state == State::Displayed) s.state = State::Retiring;
  }
  ready->state = State::Displayed;
  ++stats_.framesPresented;
  const auto latency = std::chrono::steady_clock::now() - ready->writeStart;
  const auto ns = uint64_t(std::chrono::duration_cast<std::chrono::nanoseconds>(latency).count());
  stats_.latencyNanosTotal += ns;
  stats_.latencyNanosMax = std::max(stats_.latencyNanosMax, ns);
  Frame frame{size_t(ready - slots_.data()), ready->texture, ready->sequence};
  lock.unlock();
  writable_.notify_all();
  return frame;
}

void FrameRing::reject(size_t slot) {
  {
    std::lock_guard lock(mutex_);
    if (!check(slot, State::Displayed)) return;
    slots_[slot].state = State::Free;
  }
  writable_.notify_all();
}

void FrameRing::retire(size_t slot) {
  {
    std::lock_guard lock(mutex_);
    if (!check(slot, State::Retiring)) return;
    slots_[slot].state = State::Free;
  }
  writable_.notify_all();
}

void FrameRing::consumerReset() {
  {
    std::lock_guard lock(mutex_);
    for (Slot& s : slots_) {
      if (s.state == State::Displayed || s.state == State::Retiring) s.state = State::Free;
    }
  }
  writable_.notify_all();
}

void FrameRing::close() {
  {
    std::lock_guard lock(mutex_);
    closed_ = true;
  }
  writable_.notify_all();
}

bool FrameRing::closed() const {
  std::lock_guard lock(mutex_);
  return closed_;
}

FrameRing::State FrameRing::state(size_t slot) const {
  std::lock_guard lock(mutex_);
  if (slot >= slots_.size()) throw std::out_of_range("frame ring slot");
  return slots_[slot].state;
}

ShareStats FrameRing::stats() const {
  std::lock_guard lock(mutex_);
  ShareStats out = stats_;
  for (const Slot& s : slots_) {
    out.gpuToCpuTransfers += s.pastCpuTransfers;
    if (s.texture) out.gpuToCpuTransfers += s.texture->cpuTransfers();
  }
  return out;
}

}  // namespace gr::host::gpu
