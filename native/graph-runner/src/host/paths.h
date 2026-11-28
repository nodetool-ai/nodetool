// Path confinement for the file and asset capabilities. Every path node code
// names is resolved here before any file operation, and refused unless its
// real (symlink-resolved) location stays inside a directory the embedder
// granted.
//
// The check resolves symlinks with realpath(), then the capability opens the
// resolved path with O_NOFOLLOW. A directory on the way that is swapped for
// a symlink between the check and the open is not caught. Node code cannot
// create symlinks through these capabilities, so only another process on the
// host could race it.
#pragma once

#include <optional>
#include <stdexcept>
#include <string>
#include <vector>

namespace gr::host {

// A directory node code may reach. `dir` is canonical (realpath). `given` is
// the directory as the embedder named it, normalized, so a path under a
// symlinked spelling of the root (macOS /tmp) passes the lexical gate too.
struct Root {
  std::string dir;
  bool writable = false;
  std::string given;
  // The run's workspace, which can be a project folder. NodeTool keeps its
  // own files in `.nodetool/` there, so confine() refuses every path below
  // this root with a segment named `.nodetool` in any case, whichever root
  // grants it (packages/runtime-core/src/workspace.ts isReservedWorkspaceKey).
  bool reservesNodetool = false;
};

// Canonical roots for the given directories. Directories that do not exist
// are left out, so they grant nothing.
std::vector<Root> canonicalRoots(const std::vector<std::pair<std::string, bool>>& dirs);

// Marks the roots that are the workspace `workspaceDir` as reserving
// `.nodetool/`. Every capability that grants the workspace calls it.
void reserveWorkspace(std::vector<Root>& roots, const std::string& workspaceDir);

// A Node-style file system error: `what()` is "ENOENT: no such file or
// directory, open '/x'". The guest turns `code` into `err.code`.
class FsError : public std::runtime_error {
public:
  FsError(const std::string& code, const std::string& syscall, const std::string& path,
          const std::string& note = "");
  const std::string code;
};

// FsError for the current errno.
[[noreturn]] void throwErrno(int err, const std::string& syscall, const std::string& path);

// Normalizes an absolute host path without climbing above its filesystem root.
// Windows paths use forward slashes and retain their drive prefix.
std::string lexicalNormalize(const std::string& absolute);

// The directory containing the absolute host path `path`. A parent that is a
// filesystem root keeps its separator ("/", "C:/"), because Windows reads a
// bare drive ("C:") as that drive's current directory.
std::string parentOf(const std::string& path);

// Whether `path` is `dir` or below it. Both are canonical absolute paths.
bool isWithin(const std::string& dir, const std::string& path);

enum class Access {
  Read,      // the target must exist inside a root
  Write,     // the target may be missing. Its parent must exist inside a writable root
  WriteAny,  // like Write, for mkdir -p: missing ancestors are allowed
};

struct Resolved {
  // The canonical path to operate on. For a missing write target, the
  // canonical parent joined with the last component.
  std::string real;
  bool exists = false;
  const Root* root = nullptr;
};

// Resolves `path` (absolute, or relative to `cwd`) for `syscall`. Throws
// FsError EACCES when it falls outside every granted root, is a write to a
// read-only root or lies in a workspace's `.nodetool/` (before and after
// symlinks are resolved), ENOENT when a Read target or a Write parent is
// missing.
// With `noSymlinks`, a symlink anywhere below the root is refused too.
Resolved confine(const std::vector<Root>& roots, const std::string& cwd,
                 const std::string& path, Access access, const std::string& syscall,
                 bool noSymlinks = false);

// A directory entry named by a path, for the operations that act on the
// entry itself (unlink, rmdir, rename, rm): a symlink there is the link, not
// what it points at.
struct ResolvedEntry {
  // The canonical directory holding the entry, inside a writable root.
  std::string parent;
  // The entry's name in `parent`. Never empty, "." or "..".
  std::string leaf;
  const Root* root = nullptr;

  // `parent` joined with `leaf`. The leaf is not resolved.
  std::string path() const;
};

// Resolves the parent of `path` (absolute, or relative to `cwd`) as confine()
// resolves a write target's parent, and keeps the last component as it is.
// Throws FsError EINVAL when the last component is empty, "." or "..",
// EACCES when the entry is a granted root itself, lies outside every
// writable root or in a workspace's `.nodetool/`, ENOENT when the parent is
// missing. Whether the entry exists is left to the operation.
ResolvedEntry confineEntry(const std::vector<Root>& roots, const std::string& cwd,
                           const std::string& path, const std::string& syscall);

}  // namespace gr::host
