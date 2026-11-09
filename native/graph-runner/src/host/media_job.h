// The job shapes the media and track staging hosts share
// (docs/plans/graph-runner-async-host.md, sections 4.8 and 4.9).
//
// A one-shot media call (probe, packetTimes, muxAudio, remuxTracks) is a
// MediaJob: it opens, uses and frees its library contexts within one run()
// on one lane thread. A session operation (a reader's next, an encoder's
// write) is a SessionOperation on the session's ResourceControl, which hands
// the session's contexts from one operation to the next.
//
// Both read their stop through a SessionStopBridge, never through a
// temporary stop token: the libraries keep the interrupt callback, which
// points at the bridge, for the life of the context (section 4.9). The
// callback only reaches libav's I/O retry loops and the stream-info loop,
// so code also checks the bridge between packets and frames. Codec and
// filter calls are not interruptible, and neither are output writes.
#pragma once

#include "host/media.h"
#include "kernel/admission.h"
#include "kernel/async_jobs.h"
#include "kernel/resource_control.h"
#include "kernel/session_stop.h"

#include <exception>
#include <memory>
#include <optional>
#include <stdexcept>
#include <stop_token>
#include <string>
#include <utility>
#include <vector>

namespace gr::host {

// Thrown at a stop check once the operation's stop was requested.
struct MediaStopped : std::runtime_error {
  MediaStopped() : std::runtime_error("native media operation was stopped") {}
};

// The stop checks of one media operation: its session's or its job's
// bridge, and the test hooks.
//
// Thread affinity: the thread that runs the operation. Non-owning: the body
// or job that owns the bridge and the hooks outlives every copy.
class MediaStop {
public:
  MediaStop() = default;
  MediaStop(const SessionStopBridge& bridge, const MediaTestHooks& hooks) : bridge_(&bridge), hooks_(&hooks) {}
  // Between packets and frames: throws MediaStopped once stopped.
  void check() const {
    if (hooks_->checkpoint) hooks_->checkpoint([this] { return bridge_->stopped(); });
    if (bridge_->stopped()) throw MediaStopped();
  }
  bool stopped() const { return bridge_->stopped(); }
  // The opaque pointer of an AVIOInterruptCB whose callback is
  // SessionStopBridge::interrupt.
  void* opaque() const { return const_cast<SessionStopBridge*>(bridge_); }

private:
  const SessionStopBridge* bridge_ = nullptr;
  const MediaTestHooks* hooks_ = nullptr;
};

// A one-shot media call: runs `fn(MediaStop) -> JobOutcome` once. Its
// library contexts are locals of `fn`, so they are created, used and freed
// on the one lane thread that runs it. It holds leases on the staging
// directories its paths are in until it is destroyed, after run() returned
// (section 4.8: dependents release before staging-directory cleanup).
//
// Thread affinity: the lane thread that runs it (the worker in inline
// mode). It is destroyed there, or on the process JobDisposer when the lane
// refused it.
template <class F>
class MediaJob final : public NativeJob {
public:
  MediaJob(std::string name, std::shared_ptr<const MediaTestHooks> hooks, JobCost cost,
           std::vector<ResourceLease> leases, F fn)
      : leases_(std::move(leases)), name_(std::move(name)), hooks_(std::move(hooks)), cost_(cost),
        fn_(std::move(fn)) {}

  // The inputs it copied at submission, and the most its result holds.
  JobCost cost() const override { return cost_; }

  JobOutcome run(std::stop_token stop) override {
    // Declared before the binding and the contexts `fn_` creates, so it
    // outlives every interrupt callback that points at it.
    SessionStopBridge bridge;
    std::optional<JobOutcome> outcome;
    {
      SessionStopBridge::Binding binding(bridge, 1, stop);
      const MediaStop checks(bridge, *hooks_);
      try {
        if (hooks_->started) hooks_->started(name_, stop, [&bridge] { return bridge.stopped(); });
        outcome = fn_(checks);
      } catch (const std::exception& e) {
        outcome = bridge.stopped() ? stopped() : JobOutcome::failure(e.what());
      } catch (...) {
        outcome = bridge.stopped() ? stopped() : JobOutcome::failure("native media " + name_ + " failed");
      }
    }
    return std::move(*outcome);
  }

private:
  JobOutcome stopped() const {
    return JobOutcome{JobOutcome::Kind::Stopped, nullptr, "native media " + name_ + " was stopped"};
  }
  // Released last, when the job is destroyed.
  std::vector<ResourceLease> leases_;
  std::string name_;
  std::shared_ptr<const MediaTestHooks> hooks_;
  JobCost cost_;
  F fn_;
};

template <class F>
std::unique_ptr<NativeJob> makeMediaJob(std::string name, std::shared_ptr<const MediaTestHooks> hooks, JobCost cost,
                                        std::vector<ResourceLease> leases, F fn) {
  return std::make_unique<MediaJob<F>>(std::move(name), std::move(hooks), cost, std::move(leases), std::move(fn));
}

// An operation on one media session: runs `fn(Body&,
// ResourceOperationContext&) -> JobOutcome` as its control's active
// operation, with the body's bridge bound to the operation's stop. `Body`
// has a public SessionStopBridge `bridge`. A stop seen between packets and
// frames, or an interrupted library call, leaves the codec state unknown:
// the operation resolves Stopped (an AbortError) and retires the session,
// whose queued operations then reject.
//
// Thread affinity: the lane thread that runs it.
template <class Body, class F>
class SessionOperation final : public ResourceOperation {
public:
  SessionOperation(std::shared_ptr<ResourceControl> control, std::string name,
                   std::shared_ptr<const MediaTestHooks> hooks, JobCost cost, F fn)
      : ResourceOperation(std::move(control)), name_(std::move(name)), hooks_(std::move(hooks)), cost_(cost),
        fn_(std::move(fn)) {}

  JobCost cost() const override { return cost_; }

protected:
  JobOutcome apply(ResourceBody& body, ResourceOperationContext& context) override {
    auto& session = static_cast<Body&>(body);
    try {
      if (hooks_->started) {
        hooks_->started(name_, context.stop(), [&session] { return session.bridge.stopped(); });
      }
      return fn_(session, context);
    } catch (const std::exception&) {
      if (!session.bridge.stopped()) throw;
      std::string reason = "native media " + name_ + " was stopped";
      context.retireSession(reason);
      return JobOutcome{JobOutcome::Kind::Stopped, nullptr, std::move(reason)};
    }
  }

private:
  std::string name_;
  std::shared_ptr<const MediaTestHooks> hooks_;
  JobCost cost_;
  F fn_;
};

template <class Body, class F>
std::unique_ptr<NativeJob> makeSessionOperation(std::shared_ptr<ResourceControl> control, std::string name,
                                                std::shared_ptr<const MediaTestHooks> hooks, JobCost cost, F fn) {
  return std::make_unique<SessionOperation<Body, F>>(std::move(control), std::move(name), std::move(hooks), cost,
                                                     std::move(fn));
}

}  // namespace gr::host
