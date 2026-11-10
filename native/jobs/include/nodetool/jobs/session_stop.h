// The stop state of one library session
// (docs/plans/graph-runner-async-host.md, section 4.9).
//
// A persistent library session, such as a media input whose interrupt
// callback the library keeps, must not read a temporary operation's stop
// token: the token dies with the operation while the library still holds
// the callback. The session instead owns one SessionStopBridge for its whole
// life, and points the library's interrupt callback at it. Each operation
// binds its own stop token to the bridge for the length of the operation.
#pragma once

#include <atomic>
#include <cstdint>
#include <functional>
#include <memory>
#include <optional>
#include <stop_token>

namespace nodetool::jobs {

// Two stop flags with one reader: sessionStopped, set once by retirement and
// never cleared, and operationStopped, set by the active operation's stop
// and cleared when that operation ends. Library interrupt callbacks read
// stopped(), the OR of both.
//
// Thread affinity: stopped(), sessionStopped(), operationStopped(),
// activeOperation() and retire() are thread-safe: the flags are atomics in
// `flags_`. A Binding belongs to the session's serial executor: at most one
// exists at a time, and the thread that runs the operation creates and
// destroys it.
//
// Ownership: the session owns its bridge by value or through
// std::unique_ptr, so the bridge lives exactly as long as the library
// context whose interrupt callback points at it. Destroy that context
// before the bridge. Destroying the bridge while a Binding exists is a bug,
// and debug builds assert it.
class SessionStopBridge {
public:
  // Called after a stop set a flag, on the thread that requested the stop or
  // called retire(). It may only issue a non-blocking wake, such as waking a
  // library wait. It never takes a resource lock, calls the library or
  // waits.
  using Wake = std::function<void()>;

private:
  // The flags and the wake. Thread-safe: atomics, and a wake that is set
  // before any binding exists and never changed.
  //
  // Thread affinity: thread-safe, as described above.
  struct Flags {
    explicit Flags(Wake w) : wake(std::move(w)) {}
    std::atomic<bool> session{false};
    std::atomic<bool> operation{false};
    std::atomic<uint64_t> active{0};
    // A binding exists. Checked in debug builds.
    std::atomic<bool> bound{false};
    const Wake wake;
  };

public:
  explicit SessionStopBridge(Wake wake = {});
  ~SessionStopBridge();
  SessionStopBridge(const SessionStopBridge&) = delete;
  SessionStopBridge& operator=(const SessionStopBridge&) = delete;

  // One operation's binding, created by the serial executor before it
  // enters the library. The constructor sets the active operation id,
  // resets operationStopped and then registers a callback on `stop` that
  // only sets operationStopped and calls the wake. A token that already
  // requested stop sets the flag at once. The destructor first destroys the
  // callback registration, which waits for a callback running on another
  // thread, and only then resets the flag and the active id. Destroy it
  // outside every lock, before the next operation starts.
  //
  // Thread affinity: the serial executor's thread, from construction to
  // destruction. Not movable, so it cannot leave that thread's scope.
  class Binding {
  public:
    Binding(SessionStopBridge& bridge, uint64_t operation, std::stop_token stop);
    ~Binding();
    Binding(const Binding&) = delete;
    Binding& operator=(const Binding&) = delete;

  private:
    // The stop callback. Holds the flags it sets through a shared pointer,
    // never the bridge.
    //
    // Thread affinity: runs on the thread that requests the stop, or on the
    // thread constructing the binding when the token is already stopped. It
    // only sets atomic flags and calls the non-blocking wake.
    struct SetFlag {
      std::shared_ptr<Flags> flags;
      void operator()() const;
    };

    std::shared_ptr<Flags> flags_;
    // Reset first, in the destructor body.
    std::optional<std::stop_callback<SetFlag>> callback_;
  };

  // Sets sessionStopped permanently, then calls the wake. Idempotent. Call
  // outside every lock, since the wake runs.
  void retire();

  bool stopped() const;
  bool sessionStopped() const;
  bool operationStopped() const;
  // The bound operation's id, or 0 between operations.
  uint64_t activeOperation() const;

  // An AVIOInterruptCB-style callback: `bridge` is a SessionStopBridge*.
  // Returns 1 once stopped() holds, else 0.
  static int interrupt(void* bridge);

private:
  // Shared with the active binding's stop callback, which can run on the
  // requesting thread while the serial executor unbinds. The binding's
  // destructor waits for that callback, so the bridge outlives every use.
  // Sharing keeps the callback away from the bridge object itself.
  std::shared_ptr<Flags> flags_;
};

}  // namespace nodetool::jobs
