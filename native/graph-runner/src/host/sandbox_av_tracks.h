#pragma once
#include "host/media.h"
#include "kernel/async_jobs.h"
#include "nodetool/jobs/resource_control.h"

#include <map>
#include <memory>
#include <string>
#include <vector>
namespace gr::host {
// The Code media staging directories of one engine
// (docs/plans/graph-runner-async-host.md, section 4.8). Each directory is a
// ResourceControl on the run's I/O lane whose body removes the directory
// when it is destroyed, on that lane's reaper. Every media reader, encoder
// and one-shot job whose paths are inside a directory holds a lease on it,
// taken on the worker when the call is submitted. releaseTempDir and run
// cleanup therefore remove a directory only after its dependents released
// it, and a dependent releases only after its own library contexts were
// freed.
//
// Thread affinity: worker only: the host functions and the run cleanup of
// the engine that keeps it. The controls are thread-safe.
//
// Ownership: kept in the engine's host state and shared with the host
// functions and the run cleanup that use it.
class MediaStaging final : public js::NativePayload {
public:
  // The engine's registry, created on first use with a run cleanup that
  // aborts every directory.
  static std::shared_ptr<MediaStaging> of(js::Engine& engine);

  // Registers `path`, a directory just created, on `lane`, which must
  // outlive it.
  void add(const std::string& path, nodetool::jobs::JobExecutor& lane);
  // Closes `path`: it is removed once every lease on it is released.
  // Throws when `path` is not an open staging directory.
  void release(const std::string& path);
  // Adds a lease on each open staging directory that contains `real`, a
  // canonical path, to `leases`. Throws when a directory that contains it
  // was released.
  void lease(const std::string& real, std::vector<nodetool::jobs::ResourceLease>& leases);
  // Directories not released yet.
  size_t open();
  // Run cleanup: aborts every directory. Each is removed once its
  // dependents released it.
  void abortAll();

private:
  // Forgets directories already removed.
  void prune();
  std::map<std::string, std::shared_ptr<nodetool::jobs::ResourceControl>> directories_;
};
// The Code addAudio helper retains original tracks when explicitly requested.
void installSandboxAvTracks(js::Engine &, const js::Value &,
                            const HostOptions &, const MediaOptions &);
} // namespace gr::host
