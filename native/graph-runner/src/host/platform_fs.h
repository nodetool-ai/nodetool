#pragma once

#include <cstddef>
#include <cstdint>
#include <ctime>
#include <cstdio>
#include <cstdlib>
#include <memory>
#include <fcntl.h>

#ifndef _WIN32
#include <dirent.h>
#include <sys/stat.h>
#include <unistd.h>
namespace gr::host::fsapi {
using FileStat = struct stat;
using Dir = DIR;
using Entry = struct dirent;
using Offset = off_t;
using Count = ssize_t;
using Mode = mode_t;
using Device = dev_t;
using Inode = ino_t;
using ::close; using ::dup; using ::open; using ::openat;
using ::read; using ::write; using ::pread; using ::lseek; using ::ftruncate;
using ::stat; using ::lstat; using ::fstat; using ::fstatat;
using ::readdir; using ::dirfd;
using Directory = std::unique_ptr<Dir, int (*)(Dir*)>;
inline Directory opendir(const char* path) { return Directory(::opendir(path), ::closedir); }
inline Directory fdopendir(int fd) { return Directory(::fdopendir(fd), ::closedir); }
using ::mkdir; using ::mkdirat; using ::mkdtemp; using ::rmdir;
using ::unlink; using ::unlinkat; using ::rename; using ::renameat;
using ::realpath; using ::getpid;
}
#else
#include <cerrno>
#include <memory>
#include <sys/stat.h>

#define O_NOFOLLOW 0x01000000
#define O_DIRECTORY 0x02000000
#define O_CLOEXEC 0x04000000
#define O_NONBLOCK 0x08000000
#define AT_SYMLINK_NOFOLLOW 0x100
#define AT_REMOVEDIR 0x200
#define S_ISREG(m) (((m) & 0170000) == 0100000)
#define S_ISDIR(m) (((m) & 0170000) == 0040000)
#define S_ISLNK(m) (((m) & 0170000) == 0120000)
#define DT_UNKNOWN 0
#define DT_DIR 4
#define DT_REG 8
#define DT_LNK 10
#ifndef PATH_MAX
#define PATH_MAX 32768
#endif
#ifndef NAME_MAX
#define NAME_MAX 1024
#endif

namespace gr::host::fsapi {
using Offset = int64_t;
using Count = int64_t;
using Mode = unsigned;
using Device = uint64_t;
using Inode = uint64_t;
// Thread affinity: caller-owned value, transferred by copy.
struct FileStat {
  Mode st_mode = 0;
  int64_t st_size = 0;
  uint64_t st_nlink = 0;
  Device st_dev = 0;
  Inode st_ino = 0;
  timespec st_mtim{}, st_ctim{};
  int64_t st_mtime = 0;
};
// Thread affinity: the directory's caller. Borrowed until the next enumeration step.
struct Entry { char d_name[NAME_MAX + 1]{}; unsigned char d_type = DT_UNKNOWN; };
// Thread affinity: one caller at a time. Owns the descriptor and enumeration buffer.
struct Dir {
  Dir() = default;
  Dir(const Dir&) = delete;
  Dir& operator=(const Dir&) = delete;
  int descriptor = -1;
  bool restart = true;
  Entry entry;
  alignas(8) unsigned char buffer[4096]{};
  size_t offset = 0;
  bool buffered = false;
  ~Dir();
};
int close(int fd);
int dup(int fd);
int open(const char* path, int flags, int mode = 0);
int openat(int parent, const char* name, int flags, int mode = 0);
Count read(int fd, void* data, size_t size);
Count write(int fd, const void* data, size_t size);
Count pread(int fd, void* data, size_t size, Offset offset);
Offset lseek(int fd, Offset offset, int origin);
int ftruncate(int fd, Offset size);
int stat(const char* path, FileStat* out);
int lstat(const char* path, FileStat* out);
int fstat(int fd, FileStat* out);
int fstatat(int parent, const char* name, FileStat* out, int flags);
using Directory = std::unique_ptr<Dir>;
Directory opendir(const char* path);
Directory fdopendir(int fd);
Entry* readdir(Dir* directory);
int dirfd(Dir* directory);
int mkdir(const char* path, int mode);
int mkdirat(int parent, const char* name, int mode);
char* mkdtemp(char* pattern);
int rmdir(const char* path);
int unlink(const char* path);
int unlinkat(int parent, const char* name, int flags);
int rename(const char* from, const char* to);
int renameat(int fromParent, const char* from, int toParent, const char* to);
char* realpath(const char* path, char* output);
int getpid();
}
#endif
