#include "host/paths.h"

#include <cerrno>
#include <climits>
#include <cstdlib>
#include <cstring>
#include <map>
#include <sys/stat.h>

namespace gr::host {
namespace {

// libuv's messages, which Node puts in its fs errors.
const std::map<std::string, std::string>& descriptions() {
  static const std::map<std::string, std::string> table = {
      {"ENOENT", "no such file or directory"},
      {"EACCES", "permission denied"},
      {"EPERM", "operation not permitted"},
      {"EISDIR", "illegal operation on a directory"},
      {"ENOTDIR", "not a directory"},
      {"EEXIST", "file already exists"},
      {"ENOTEMPTY", "directory not empty"},
      {"ELOOP", "too many symbolic links encountered"},
      {"EINVAL", "invalid argument"},
      {"EXDEV", "cross-device link not permitted"},
      {"ENAMETOOLONG", "name too long"},
      {"EFBIG", "file too large"},
      {"ENOSPC", "no space left on device"},
      {"EROFS", "read-only file system"},
      {"EIO", "i/o error"},
      {"EBUSY", "resource busy or locked"},
  };
  return table;
}

std::string codeFor(int err) {
  switch (err) {
    case ENOENT: return "ENOENT";
    case EACCES: return "EACCES";
    case EPERM: return "EPERM";
    case EISDIR: return "EISDIR";
    case ENOTDIR: return "ENOTDIR";
    case EEXIST: return "EEXIST";
    case ENOTEMPTY: return "ENOTEMPTY";
    case ELOOP: return "ELOOP";
    case EINVAL: return "EINVAL";
    case EXDEV: return "EXDEV";
    case ENAMETOOLONG: return "ENAMETOOLONG";
    case EFBIG: return "EFBIG";
    case ENOSPC: return "ENOSPC";
    case EROFS: return "EROFS";
    default: return "EIO";
  }
}

std::string message(const std::string& code, const std::string& syscall,
                    const std::string& path, const std::string& note) {
  auto it = descriptions().find(code);
  std::string text = code + ": " + (it == descriptions().end() ? "unknown error" : it->second) +
                     ", " + syscall + " '" + path + "'";
  if (!note.empty()) text += " (" + note + ")";
  return text;
}

std::optional<std::string> realPath(const std::string& path, int& err) {
  char buf[PATH_MAX];
  if (::realpath(path.c_str(), buf)) return std::string(buf);
  err = errno;
  return std::nullopt;
}

std::string parentOf(const std::string& path) {
  auto slash = path.rfind('/');
  return slash == 0 || slash == std::string::npos ? "/" : path.substr(0, slash);
}

std::string leafOf(const std::string& path) {
  auto slash = path.rfind('/');
  return slash == std::string::npos ? path : path.substr(slash + 1);
}

std::string joinPath(const std::string& dir, const std::string& leaf) {
  return dir == "/" ? "/" + leaf : dir + "/" + leaf;
}

// The root holding `real`, preferring a writable one when roots nest.
const Root* rootOf(const std::vector<Root>& roots, const std::string& real) {
  const Root* found = nullptr;
  for (const auto& r : roots) {
    if (!isWithin(r.dir, real)) continue;
    if (!found || (r.writable && !found->writable)) found = &r;
  }
  return found;
}

const char* kOutside = "outside the directories the native runner grants";

}  // namespace

FsError::FsError(const std::string& c, const std::string& syscall, const std::string& path,
                 const std::string& note)
    : std::runtime_error(message(c, syscall, path, note)), code(c) {}

void throwErrno(int err, const std::string& syscall, const std::string& path) {
  throw FsError(codeFor(err), syscall, path);
}

std::vector<Root> canonicalRoots(const std::vector<std::pair<std::string, bool>>& dirs) {
  std::vector<Root> roots;
  for (const auto& [dir, writable] : dirs) {
    if (dir.empty()) continue;
    int err = 0;
    auto real = realPath(dir, err);
    struct stat st {};
    if (!real || ::stat(real->c_str(), &st) != 0 || !S_ISDIR(st.st_mode)) continue;
    roots.push_back({*real, writable, dir[0] == '/' ? lexicalNormalize(dir) : *real});
  }
  return roots;
}

std::string lexicalNormalize(const std::string& absolute) {
  std::vector<std::string> parts;
  size_t i = 0;
  while (i <= absolute.size()) {
    size_t j = absolute.find('/', i);
    if (j == std::string::npos) j = absolute.size();
    std::string part = absolute.substr(i, j - i);
    if (part == "..") {
      if (!parts.empty()) parts.pop_back();
    } else if (!part.empty() && part != ".") {
      parts.push_back(part);
    }
    i = j + 1;
  }
  std::string out;
  for (const auto& p : parts) out += "/" + p;
  return out.empty() ? "/" : out;
}

bool isWithin(const std::string& dir, const std::string& path) {
  if (dir == "/") return !path.empty() && path[0] == '/';
  return path == dir || (path.size() > dir.size() && path.compare(0, dir.size(), dir) == 0 &&
                         path[dir.size()] == '/');
}

Resolved confine(const std::vector<Root>& roots, const std::string& cwd, const std::string& path,
                 Access access, const std::string& syscall, bool noSymlinks) {
  if (path.empty()) throw FsError("ENOENT", syscall, path);
  if (path.find('\0') != std::string::npos) throw FsError("EINVAL", syscall, path);
  std::string absolute;
  if (path[0] == '/') {
    absolute = path;
  } else if (cwd.empty()) {
    throw FsError("EACCES", syscall, path, "a relative path needs a workspace directory");
  } else {
    absolute = cwd + "/" + path;
  }
  const std::string lexical = lexicalNormalize(absolute);
  // Refuse before touching the file system, so a refused path reveals
  // nothing about what exists outside the roots.
  bool inside = false;
  for (const auto& r : roots) inside = inside || isWithin(r.dir, lexical) || isWithin(r.given, lexical);
  if (!inside) throw FsError("EACCES", syscall, path, kOutside);

  auto check = [&](const std::string& real, const std::string& lexicalForm) -> const Root* {
    const Root* root = rootOf(roots, real);
    if (!root) throw FsError("EACCES", syscall, path, kOutside);
    // A symlink above the root, such as /var -> /private/var on macOS, was
    // resolved when the root was granted. Only a symlink below it is refused.
    const bool viaGiven = root->given != "/" && isWithin(root->given, lexicalForm);
    const std::string expected = viaGiven ? root->dir + lexicalForm.substr(root->given.size()) : lexicalForm;
    if (noSymlinks && real != expected) {
      throw FsError("EACCES", syscall, path, "symbolic links are refused here");
    }
    if (access != Access::Read && !root->writable) {
      throw FsError("EACCES", syscall, path, "read-only directory");
    }
    return root;
  };

  int err = 0;
  if (auto real = realPath(lexical, err)) {
    const Root* root = check(*real, lexical);
    return {*real, true, root};
  }
  if (err != ENOENT) throwErrno(err, syscall, path);
  struct stat st {};
  if (::lstat(lexical.c_str(), &st) == 0) {
    // A dangling symlink. Following it on create could leave the roots.
    throw FsError(access == Access::Read ? "ENOENT" : "EACCES", syscall, path,
                  access == Access::Read ? "" : "dangling symbolic link");
  }
  if (access == Access::Read) throw FsError("ENOENT", syscall, path);

  std::string ancestor = parentOf(lexical);
  std::string tail = leafOf(lexical);
  while (true) {
    if (auto real = realPath(ancestor, err)) {
      const Root* root = check(*real, ancestor);
      return {joinPath(*real, tail), false, root};
    }
    if (err != ENOENT || access == Access::Write) throwErrno(err, syscall, path);
    if (::lstat(ancestor.c_str(), &st) == 0) {
      throw FsError("EACCES", syscall, path, "dangling symbolic link");
    }
    tail = leafOf(ancestor) + "/" + tail;
    ancestor = parentOf(ancestor);
  }
}

}  // namespace gr::host
