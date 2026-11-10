// Serialized asset writes and removals (docs/plans/graph-runner-async-host.md,
// section 4.8, last paragraph). `__host.assets.writeAsync` and `removeAsync`
// submit the jobs here, and the synchronous `write` and `remove` use
// writeAssetNow() and removeAssetNow().
//
// A write job is created on the worker, which takes its ticket in the
// destination queue, keyed by the canonical destination: the canonical asset
// directory joined with the checked key. On the I/O lane it acquires the
// destination's parent directory one component at a time: it opens the
// asset directory, then each component relative to the descriptor before it
// with O_DIRECTORY and O_NOFOLLOW, creating a missing one with mkdirat
// relative to its parent's descriptor. A symlink at any step refuses the
// write, and no path is resolved again after a check. It keeps the parent's
// descriptor until the job completes and writes the bytes to a temporary
// file of its own, created relative to that descriptor with O_EXCL and
// O_NOFOLLOW. When its turn in the queue comes it acquires the parent again
// the same way and checks that it is the directory it holds, then renames
// the temporary file over the destination relative to the held descriptor.
// That rename is the commit: readers see the whole old or the whole new
// file, and later teardown does not undo it. A stop before the commit
// discards the write. On every path that does not commit, the job unlinks
// its own temporary file, relative to the held descriptor, and no other.
//
// A removal takes its ticket the same way, acquires the parent the same way
// when its turn comes, and unlinks the destination, a regular file,
// relative to that descriptor.
//
// A directory moved after acquisition, inside or outside the asset
// directory, or replaced, fails the commit: the second acquisition no longer
// reaches the held directory. The write then only removes its own temporary
// file from the moved directory. Nothing locks the tree, so a move in the
// short window between the second acquisition and the rename places the file
// in the held directory at its new location. No step ever follows a
// symlink. The asset directory itself is trusted: it is opened by its
// canonical path.
//
// Different processes still have atomic last-rename semantics, with no
// ordering promise between them.
#pragma once

#include "host/paths.h"
#include "kernel/async_jobs.h"
#include "kernel/destination_queue.h"

#include <cstdint>
#include <functional>
#include <memory>
#include <string>
#include <string_view>
#include <vector>

namespace gr::host {

// The destination queue key of asset `key` under the asset directory, the
// first of `roots`: its canonical directory joined with the key. Checks the
// key's syntax without touching the file system, since the key is taken on
// the worker: a key that is empty, absolute, holds `..`, a backslash or a
// NUL, or a missing or read-only asset directory, throws FsError EACCES or
// std::invalid_argument.
std::string assetDestination(const std::vector<Root>& roots, const std::string& key);

// The Value of a removal: whether a file was removed.
//
// Thread affinity: none. Created on the committing thread, it travels to the
// worker in its JobResult.
struct AssetRemoved final : nodetool::jobs::JobPayload {
  explicit AssetRemoved(bool r) : removed(r) {}
  bool removed;
};

// Test seams. Production leaves them empty. `at` runs on the job's thread
// at the named point: "write:acquired" (directories acquired, before the
// temporary file), "write:staged" (temporary file written),
// "commit:validated" (parent acquired again and matched, before the rename)
// and "remove:acquired" (parent acquired, before the unlink).
struct AssetJobHooks {
  std::function<void(std::string_view point)> at;
};

// A write of `bytes` to asset `key`, ordered behind every earlier write and
// removal of the same destination that took a ticket in `queue`. Call on
// the worker when the host function accepts the write, then submit the job
// to `commits`, the I/O lane, which also runs its commit step. Production
// passes processDestinationQueue(). The job's ticket shares the queue's
// state, so `queue` itself need not outlive the job. Throws, before taking a
// ticket, for a key assetDestination() refuses. The job's Value has no
// payload.
std::unique_ptr<nodetool::jobs::NativeJob> makeAssetWriteJob(DestinationQueue& queue,
                                                             nodetool::jobs::JobExecutor& commits,
                                                             std::vector<Root> roots, std::string key,
                                                             std::vector<uint8_t> bytes, AssetJobHooks hooks = {});

// A removal of asset `key`, ordered like a write. Its Value is an
// AssetRemoved.
std::unique_ptr<nodetool::jobs::NativeJob> makeAssetRemoveJob(DestinationQueue& queue,
                                                              nodetool::jobs::JobExecutor& commits,
                                                              std::vector<Root> roots, std::string key,
                                                              AssetJobHooks hooks = {});

// The synchronous forms, for the asset store's functions outside a run.
// Each takes the destination's place only when no other operation on it is
// queued or active, and otherwise fails at once with FsError EBUSY, naming
// the key. With the place, a write stages its temporary file and commits on
// the calling thread, and a removal unlinks there, before the call returns.
// Operations that take a place afterwards, such as an asynchronous write
// from another run, queue behind it as usual. Throws FsError or
// std::runtime_error like the jobs fail, and std::invalid_argument for a
// refused key.
//
// Why this cannot deadlock: a synchronous call never blocks on the queue. It
// either finds the line empty and is its head at once, or returns EBUSY. It
// claims the head under the queue mutex before it runs its step, so no other
// scheduler takes the step, which runs inside the call, on the calling
// thread, and does not depend on any other thread. Finishing it may hand the next place's step to that
// place's executor, which a lane only queues and an inline runner runs
// there without waiting.
void writeAssetNow(DestinationQueue& queue, std::vector<Root> roots, std::string key, const std::vector<uint8_t>& bytes,
                   AssetJobHooks hooks = {});
// Whether a file was removed.
bool removeAssetNow(DestinationQueue& queue, std::vector<Root> roots, std::string key, AssetJobHooks hooks = {});

}  // namespace gr::host
