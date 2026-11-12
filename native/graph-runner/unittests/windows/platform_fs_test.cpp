#include "host/platform_fs.h"
#include "host/paths.h"
#include "host/unique_fd.h"
#include <cctype>
#include <algorithm>
#include <filesystem>
#include <iostream>
#include <stdexcept>
#include <string>
#include <utility>

namespace fs = std::filesystem;
using namespace gr::host;
void require(bool value, const char* message) { if (!value) throw std::runtime_error(message); }
template<class F> void refused(F operation) {
  try { operation(); } catch (const FsError& e) { require(e.code == "EACCES", "wrong refusal code"); return; }
  throw std::runtime_error("path was not refused");
}
// Thread affinity: main thread only. Owns an exclusively created temporary directory.
struct TestDirectory {
  fs::path path;
  TestDirectory() {
    auto pattern = (fs::temp_directory_path() / "nodetool-windows-files-XXXXXX").string();
    require(fsapi::mkdtemp(pattern.data()) != nullptr, "create test directory");
    path = pattern;
  }
  ~TestDirectory() { std::error_code error; fs::remove_all(path, error); }
};
int main(int argc, char** argv) {
  try {
    if (argc == 2) {
      const auto roots = canonicalRoots({{argv[1], true}});
      require(roots.size() == 1, "junction test root");
      const auto& root = roots.front().dir;
      refused([&] { confine(roots, root, "junction/sentinel", Access::Read, "test"); });
      refused([&] { confine(roots, root, "junction/sentinel", Access::Read, "test", true); });
      require(confine(roots, root, "inner/file", Access::Read, "test").exists, "junction inside the root is followed");
      refused([&] { confine(roots, root, "inner/file", Access::Read, "test", true); });
      refused([&] { confine(roots, root, "INNER/file", Access::Read, "test", true); });
      refused([&] { confine(roots, root, "inner/missing", Access::Write, "test", true); });
      UniqueFd directory(fsapi::open(root.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW));
      require(bool(directory), "junction parent");
      UniqueFd junction(fsapi::openat(directory.get(), "junction", O_DIRECTORY | O_NOFOLLOW));
      require(!junction && errno == ELOOP, "refuse junction traversal");
      fsapi::FileStat information{};
      require(fsapi::fstatat(directory.get(), "junction", &information, AT_SYMLINK_NOFOLLOW) == 0 && S_ISLNK(information.st_mode), "report junction as link");
      require(fsapi::unlinkat(directory.get(), "junction", 0) == 0, "remove junction itself");
      require(fs::exists(fs::path(root).parent_path() / "outside/sentinel"), "junction removal preserves target");
      std::cout << "Windows junction checks passed\n";
      return 0;
    }
    TestDirectory temporary;
    const auto root = temporary.path.generic_string();
    const auto roots = canonicalRoots({{root, true}});
    require(roots.size() == 1, "canonical root");
    require(isWithin("C:/", "C:/file"), "canonical drive root contains its files");
    // rm opens the parent of its target. "C:" would be the drive's current directory.
    require(parentOf("C:/victim") == "C:/", "parent below a drive root keeps the root separator");
    require(parentOf("C:/granted/victim") == "C:/granted", "parent of a nested path");
    require(!isWithin("C:/granted", "C:/Granted/file"), "distinct canonical directory names stay distinct");
    require(confine(roots, root, ".", Access::Read, "test").exists, "relative root");
    auto lowerDrive = root;
    lowerDrive[0] = static_cast<char>(std::tolower(static_cast<unsigned char>(lowerDrive[0])));
    require(confine(roots, root, lowerDrive, Access::Read, "test", true).exists, "drive casing is not a symlink");
    auto upperRoot = root;
    std::transform(upperRoot.begin(), upperRoot.end(), upperRoot.begin(), [](unsigned char c) { return static_cast<char>(std::toupper(c)); });
    require(confine(roots, root, upperRoot, Access::Read, "test").exists, "case-insensitive user input resolves to its canonical root");
    refused([&] { confine(roots, root, "../outside", Access::Write, "test"); });
    refused([&] { confine(roots, root, "file:stream", Access::Write, "test"); });
    refused([&] { confine(roots, root, "NUL", Access::Write, "test"); });
    refused([&] { confine(roots, root, "trailing.", Access::Write, "test"); });
    UniqueFd directory(fsapi::open(root.c_str(), O_RDONLY | O_DIRECTORY | O_NOFOLLOW));
    require(bool(directory), "open directory");
    require(fsapi::mkdirat(directory.get(), "child", 0700) == 0, "mkdirat");
    UniqueFd child(fsapi::openat(directory.get(), "child", O_RDONLY | O_DIRECTORY | O_NOFOLLOW));
    require(bool(child), "open child directory");
    UniqueFd escaped(fsapi::openat(child.get(), "../escaped", O_WRONLY | O_CREAT, 0600));
    require(!escaped, "reject relative escape");
    UniqueFd output(fsapi::openat(child.get(), "data", O_RDWR | O_CREAT | O_EXCL | O_NOFOLLOW, 0600));
    require(bool(output), "create file");
    require(fsapi::write(output.get(), "abcdef", 6) == 6, "write bytes");
    require(fsapi::lseek(output.get(), 1, SEEK_SET) == 1, "seek");
    char bytes[4]{};
    require(fsapi::pread(output.get(), bytes, 3, 2) == 3 && std::string(bytes, 3) == "cde", "positional read");
    require(fsapi::read(output.get(), bytes, 1) == 1 && bytes[0] == 'b', "positional read preserves cursor");
    require(fsapi::ftruncate(output.get(), 3) == 0, "truncate");
    fsapi::FileStat before{};
    require(fsapi::fstat(output.get(), &before) == 0 && before.st_size == 3, "file size");
    output.reset();
    fs::rename(temporary.path / "child", temporary.path / "moved");
    fs::create_directory(temporary.path / "child");
    require(fsapi::renameat(child.get(), "data", child.get(), "renamed") == 0, "rename through held directory");
    require(fs::exists(temporary.path / "moved/renamed") && !fs::exists(temporary.path / "child/renamed"), "rename stays with held directory");
    UniqueFd enumerationFd(fsapi::dup(child.get()));
    auto entries = fsapi::fdopendir(enumerationFd.get());
    require(bool(entries), "enumerate held directory");
    enumerationFd.release();
    bool found = false;
    while (const auto* entry = fsapi::readdir(entries.get())) {
      if (std::string(entry->d_name) == "renamed") found = entry->d_type == DT_REG;
    }
    require(found, "directory entry");
    require(fsapi::unlinkat(child.get(), "renamed", 0) == 0, "unlink through held directory");
    require(!fs::exists(temporary.path / "moved/renamed"), "file removed");
    // POSIX unlink ignores the file's own mode, as rm of a cloned repository needs.
    UniqueFd readOnlyFile(fsapi::openat(directory.get(), "read-only", O_WRONLY | O_CREAT | O_EXCL, 0600));
    require(bool(readOnlyFile), "create read-only file");
    readOnlyFile.reset();
    fs::permissions(temporary.path / "read-only", fs::perms::owner_write | fs::perms::group_write | fs::perms::others_write, fs::perm_options::remove);
    require((fs::status(temporary.path / "read-only").permissions() & fs::perms::owner_write) == fs::perms::none, "file is read-only");
    require(fsapi::unlinkat(directory.get(), "read-only", 0) == 0, "unlink read-only file");
    require(!fs::exists(temporary.path / "read-only"), "read-only file removed");
    // A commit renames over an asset that a reader still holds open.
    for (const auto& [name, bytes] : {std::pair{"target", "old"}, std::pair{"replacement", "new"}}) {
      UniqueFd file(fsapi::openat(directory.get(), name, O_WRONLY | O_CREAT | O_EXCL, 0600));
      require(bool(file) && fsapi::write(file.get(), bytes, 3) == 3, "create rename file");
    }
    const auto target = root + "/target";
    UniqueFd held(fsapi::open(target.c_str(), O_RDONLY));
    require(bool(held), "hold rename target open");
    require(fsapi::renameat(directory.get(), "replacement", directory.get(), "target") == 0, "rename over held destination");
    char contents[3]{};
    require(fsapi::read(held.get(), contents, 3) == 3 && std::string(contents, 3) == "old", "held handle keeps the replaced file");
    UniqueFd reopened(fsapi::open(target.c_str(), O_RDONLY));
    require(bool(reopened) && fsapi::read(reopened.get(), contents, 3) == 3 && std::string(contents, 3) == "new", "destination name opens the renamed file");
    held.reset();
    reopened.reset();
    // Windows names match without case. A key spelled in another case is no symbolic link.
    fs::create_directory(temporary.path / "cased");
    UniqueFd cased(fsapi::open((root + "/cased/img.png").c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600));
    require(bool(cased), "create cased file");
    cased.reset();
    require(confine(roots, root, "cased/IMG.PNG", Access::Read, "test", true).exists, "child casing is not a symlink");
    require(confine(roots, root, root + "/CASED/img.png", Access::Read, "test", true).exists, "directory casing is not a symlink");
    require(!confine(roots, root, "CASED/new.png", Access::Write, "test", true).exists, "missing target below a differently cased directory");
    const auto unicode = root + "/\xe6\xb5\x8b\xe8\xaf\x95-file";
    UniqueFd unicodeFile(fsapi::open(unicode.c_str(), O_WRONLY | O_CREAT | O_EXCL, 0600));
    require(bool(unicodeFile), "UTF-8 file name");
    unicodeFile.reset();
    require(confine(roots, root, unicode, Access::Read, "test").exists, "UTF-8 confinement");
    std::cout << "Windows filesystem checks passed\n";
    return 0;
  } catch (const std::exception& error) {
    std::cerr << error.what() << " (errno " << errno << ")\n";
    return 1;
  }
}
