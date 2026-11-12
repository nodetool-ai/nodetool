#include "host/platform_fs.h"
#include "host/unique_fd.h"

#ifndef NOMINMAX
#define NOMINMAX
#endif
#include <windows.h>
#include <winternl.h>
#include <bcrypt.h>
#include <io.h>
#include <process.h>
#include <algorithm>
#include <array>
#include <cstring>
#include <limits>
#include <string>
#include <vector>

// The user-mode SDK omits this WDK declaration. A relative rename must keep
// RootDirectory bound to the held handle, which SetFileInformationByHandle rejects.
// Its FILE_INFORMATION_CLASS enum contains only value 1, so casting 10 into it
// is undefined in C++. Use the native API's 32-bit enum ABI with an explicit range.
enum class NativeFileInformationClass : int { Rename = 10 };
extern "C" NTSYSAPI NTSTATUS NTAPI NtSetInformationFile(HANDLE, PIO_STATUS_BLOCK, PVOID, ULONG, NativeFileInformationClass);

namespace gr::host::fsapi {
namespace {
// Thread affinity: one caller at a time. Owns one Windows kernel handle.
struct HandleCloser { void operator()(void* value) const { if (value && value != INVALID_HANDLE_VALUE) CloseHandle(value); } };
using Handle = std::unique_ptr<void, HandleCloser>;
int fail(DWORD error = GetLastError()) {
  switch (error) {
    case ERROR_FILE_NOT_FOUND: case ERROR_PATH_NOT_FOUND: errno = ENOENT; break;
    case ERROR_ALREADY_EXISTS: case ERROR_FILE_EXISTS: errno = EEXIST; break;
    case ERROR_DIRECTORY: errno = ENOTDIR; break;
    case ERROR_DIR_NOT_EMPTY: errno = ENOTEMPTY; break;
    case ERROR_ACCESS_DENIED: case ERROR_SHARING_VIOLATION: errno = EACCES; break;
    case ERROR_INVALID_HANDLE: errno = EBADF; break;
    case ERROR_DISK_FULL: errno = ENOSPC; break;
    case ERROR_NOT_SAME_DEVICE: errno = EXDEV; break;
    case ERROR_INVALID_NAME: case ERROR_INVALID_PARAMETER: errno = EINVAL; break;
    default: errno = EIO;
  }
  return -1;
}
std::wstring wide(const char* text) {
  const int size = MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, -1, nullptr, 0);
  if (!size) { fail(); return {}; }
  std::wstring result(size, L'\0');
  MultiByteToWideChar(CP_UTF8, MB_ERR_INVALID_CHARS, text, -1, result.data(), size);
  result.pop_back();
  return result;
}
std::string utf8(const wchar_t* text, int size) {
  const int count = WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, size, nullptr, 0, nullptr, nullptr);
  if (!count) { fail(); return {}; }
  std::string result(count, '\0');
  WideCharToMultiByte(CP_UTF8, WC_ERR_INVALID_CHARS, text, size, result.data(), count, nullptr, nullptr);
  return result;
}
HANDLE handle(int fd) { return reinterpret_cast<HANDLE>(_get_osfhandle(fd)); }
bool isDirectory(HANDLE value) {
  FILE_STANDARD_INFO info{};
  return GetFileInformationByHandleEx(value, FileStandardInfo, &info, sizeof(info)) && info.Directory;
}
int descriptor(Handle value, int flags) {
  const int fd = _open_osfhandle(reinterpret_cast<intptr_t>(value.get()), _O_BINARY | (flags & (O_APPEND | O_RDONLY | O_WRONLY | O_RDWR)));
  if (fd >= 0) value.release();
  return fd;
}
bool component(const char* name) {
  const std::string value(name);
  if (value.empty() || value == "." || value == ".." || value.find_first_of("/\\:") != std::string::npos ||
      value.back() == '.' || value.back() == ' ') { errno = EACCES; return false; }
  return true;
}
Handle relativeHandle(int parent, const char* name, ACCESS_MASK access, ULONG disposition, ULONG options) {
  if (!component(name)) return {};
  auto text = wide(name);
  if (text.empty() || text.size() * sizeof(wchar_t) > USHRT_MAX) { errno = EINVAL; return {}; }
  UNICODE_STRING string{};
  string.Buffer = text.data();
  string.Length = static_cast<USHORT>(text.size() * sizeof(wchar_t));
  string.MaximumLength = string.Length;
  OBJECT_ATTRIBUTES attributes{};
  attributes.Length = sizeof(attributes);
  attributes.RootDirectory = handle(parent);
  attributes.ObjectName = &string;
  attributes.Attributes = OBJ_CASE_INSENSITIVE;
  IO_STATUS_BLOCK status{};
  HANDLE result = nullptr;
  const NTSTATUS code = NtCreateFile(&result, access | SYNCHRONIZE, &attributes, &status, nullptr,
      FILE_ATTRIBUTE_NORMAL, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      disposition, options | FILE_SYNCHRONOUS_IO_NONALERT, nullptr, 0);
  if (code < 0) { fail(RtlNtStatusToDosError(code)); return {}; }
  return Handle(result);
}
int finishOpen(Handle value, int flags) {
  if (!value || value.get() == INVALID_HANDLE_VALUE) return fail();
  FILE_ATTRIBUTE_TAG_INFO attributes{};
  if (!GetFileInformationByHandleEx(value.get(), FileAttributeTagInfo, &attributes, sizeof(attributes))) return fail();
  if ((flags & O_NOFOLLOW) && (attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT)) { errno = ELOOP; return -1; }
  if ((flags & O_DIRECTORY) && !(attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY)) { errno = ENOTDIR; return -1; }
  if (!(flags & O_DIRECTORY) && (attributes.FileAttributes & FILE_ATTRIBUTE_DIRECTORY)) { errno = EISDIR; return -1; }
  return descriptor(std::move(value), flags);
}
ACCESS_MASK accessFor(int flags) {
  if (flags & O_DIRECTORY) return FILE_LIST_DIRECTORY | FILE_READ_ATTRIBUTES;
  return (flags & O_RDWR) ? GENERIC_READ | GENERIC_WRITE : ((flags & O_WRONLY) ? GENERIC_WRITE : GENERIC_READ);
}
timespec timeValue(const FILETIME& value) {
  const uint64_t ticks = (uint64_t(value.dwHighDateTime) << 32) | value.dwLowDateTime;
  const int64_t nanos100 = static_cast<int64_t>(ticks) - 116444736000000000LL;
  return {nanos100 / 10000000, static_cast<long>((nanos100 % 10000000) * 100)};
}
int inspect(HANDLE value, FileStat* out) {
  BY_HANDLE_FILE_INFORMATION info{};
  if (!GetFileInformationByHandle(value, &info)) return fail();
  out->st_mode = ((info.dwFileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? 0120000 :
      ((info.dwFileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? 0040000 : 0100000)) | 0600;
  out->st_size = static_cast<int64_t>((uint64_t(info.nFileSizeHigh) << 32) | info.nFileSizeLow);
  out->st_nlink = info.nNumberOfLinks;
  out->st_dev = info.dwVolumeSerialNumber;
  out->st_ino = (uint64_t(info.nFileIndexHigh) << 32) | info.nFileIndexLow;
  out->st_mtim = timeValue(info.ftLastWriteTime);
  out->st_ctim = timeValue(info.ftCreationTime);
  out->st_mtime = out->st_mtim.tv_sec;
  return 0;
}
Handle pathHandle(const char* path, DWORD access, DWORD disposition, DWORD attributes) {
  auto text = wide(path);
  if (text.empty()) return {};
  Handle result(CreateFileW(text.c_str(), access, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE,
      nullptr, disposition, attributes, nullptr));
  if (result.get() == INVALID_HANDLE_VALUE) { fail(); return {}; }
  return result;
}
int removeHandle(Handle value, bool directory) {
  if (!value) return -1;
  FILE_ATTRIBUTE_TAG_INFO attributes{};
  if (!GetFileInformationByHandleEx(value.get(), FileAttributeTagInfo, &attributes, sizeof(attributes))) return fail();
  const bool isLink = (attributes.FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) != 0;
  if ((!isLink && isDirectory(value.get())) != directory) { errno = directory ? ENOTDIR : EISDIR; return -1; }
  FILE_DISPOSITION_INFO info{TRUE};
  return SetFileInformationByHandle(value.get(), FileDispositionInfo, &info, sizeof(info)) ? 0 : fail();
}
}
int close(int fd) { return _close(fd); }
int dup(int fd) { return _dup(fd); }
int getpid() { return _getpid(); }
int open(const char* path, int flags, int) {
  const DWORD disposition = (flags & O_CREAT) ? ((flags & O_EXCL) ? CREATE_NEW : ((flags & O_TRUNC) ? CREATE_ALWAYS : OPEN_ALWAYS)) :
      ((flags & O_TRUNC) ? TRUNCATE_EXISTING : OPEN_EXISTING);
  auto value = pathHandle(path, accessFor(flags), disposition, FILE_FLAG_BACKUP_SEMANTICS | ((flags & O_NOFOLLOW) ? FILE_FLAG_OPEN_REPARSE_POINT : 0));
  if (!value) return -1;
  return finishOpen(std::move(value), flags);
}
int openat(int parent, const char* name, int flags, int) {
  const ULONG disposition = (flags & O_CREAT) ? ((flags & O_EXCL) ? FILE_CREATE : ((flags & O_TRUNC) ? FILE_OVERWRITE_IF : FILE_OPEN_IF)) :
      ((flags & O_TRUNC) ? FILE_OVERWRITE : FILE_OPEN);
  auto value = relativeHandle(parent, name, accessFor(flags), disposition,
      ((flags & O_DIRECTORY) ? FILE_DIRECTORY_FILE : FILE_NON_DIRECTORY_FILE) | ((flags & O_NOFOLLOW) ? FILE_OPEN_REPARSE_POINT : 0));
  if (!value) return -1;
  return finishOpen(std::move(value), flags);
}
Count read(int fd, void* data, size_t size) { return _read(fd, data, static_cast<unsigned>(std::min(size, size_t(INT_MAX)))); }
Count write(int fd, const void* data, size_t size) { return _write(fd, data, static_cast<unsigned>(std::min(size, size_t(INT_MAX)))); }
Count pread(int fd, void* data, size_t size, Offset offset) {
  if (offset < 0) { errno = EINVAL; return -1; }
  // ReOpenFile gives this positional read its own file position without sharing mutable cursor state.
  Handle independent(ReOpenFile(handle(fd), GENERIC_READ, FILE_SHARE_READ | FILE_SHARE_WRITE | FILE_SHARE_DELETE, FILE_FLAG_OVERLAPPED));
  if (independent.get() == INVALID_HANDLE_VALUE) return fail();
  Handle event(CreateEventW(nullptr, TRUE, FALSE, nullptr));
  if (!event) return fail();
  OVERLAPPED operation{};
  operation.Offset = static_cast<DWORD>(offset);
  operation.OffsetHigh = static_cast<DWORD>(uint64_t(offset) >> 32);
  operation.hEvent = event.get();
  DWORD count = 0;
  if (!ReadFile(independent.get(), data, static_cast<DWORD>(std::min(size, size_t(INT_MAX))), &count, &operation)) {
    const DWORD error = GetLastError();
    if (error == ERROR_HANDLE_EOF) return 0;
    if (error != ERROR_IO_PENDING) return fail(error);
    if (!GetOverlappedResult(independent.get(), &operation, &count, TRUE)) {
      if (GetLastError() == ERROR_HANDLE_EOF) return 0;
      return fail();
    }
  }
  return count;
}
Offset lseek(int fd, Offset offset, int origin) { return isDirectory(handle(fd)) && offset == 0 ? 0 : _lseeki64(fd, offset, origin); }
int ftruncate(int fd, Offset size) { const auto error = _chsize_s(fd, size); if (error) { errno = error; return -1; } return 0; }
int fstat(int fd, FileStat* out) { return inspect(handle(fd), out); }
int stat(const char* path, FileStat* out) { auto value = pathHandle(path, FILE_READ_ATTRIBUTES, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS); return value ? inspect(value.get(), out) : -1; }
int lstat(const char* path, FileStat* out) { auto value = pathHandle(path, FILE_READ_ATTRIBUTES, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT); return value ? inspect(value.get(), out) : -1; }
int fstatat(int parent, const char* name, FileStat* out, int flags) {
  auto value = relativeHandle(parent, name, FILE_READ_ATTRIBUTES, FILE_OPEN, (flags & AT_SYMLINK_NOFOLLOW) ? FILE_OPEN_REPARSE_POINT : 0);
  return value ? inspect(value.get(), out) : -1;
}
Dir::~Dir() { if (descriptor >= 0) fsapi::close(descriptor); }
Directory fdopendir(int fd) {
  if (!isDirectory(handle(fd))) { errno = ENOTDIR; return nullptr; }
  auto result = std::make_unique<Dir>();
  result->descriptor = fd;
  return result;
}
Directory opendir(const char* path) {
  UniqueFd fd(fsapi::open(path, O_RDONLY | O_DIRECTORY));
  if (!fd) return nullptr;
  auto result = fdopendir(fd.get());
  if (result) fd.release();
  return result;
}
int dirfd(Dir* directory) { return directory->descriptor; }
Entry* readdir(Dir* directory) {
  if (!directory->buffered) {
    const auto kind = directory->restart ? FileIdBothDirectoryRestartInfo : FileIdBothDirectoryInfo;
    if (!GetFileInformationByHandleEx(handle(directory->descriptor), kind, directory->buffer, sizeof(directory->buffer))) {
      if (GetLastError() != ERROR_NO_MORE_FILES) fail();
      return nullptr;
    }
    directory->restart = false;
    directory->offset = 0;
    directory->buffered = true;
  }
  const auto* info = reinterpret_cast<const FILE_ID_BOTH_DIR_INFO*>(directory->buffer + directory->offset);
  const auto name = utf8(info->FileName, static_cast<int>(info->FileNameLength / sizeof(wchar_t)));
  if (name.size() > NAME_MAX) { errno = ENAMETOOLONG; return nullptr; }
  std::memcpy(directory->entry.d_name, name.c_str(), name.size() + 1);
  directory->entry.d_type = (info->FileAttributes & FILE_ATTRIBUTE_REPARSE_POINT) ? DT_LNK :
      ((info->FileAttributes & FILE_ATTRIBUTE_DIRECTORY) ? DT_DIR : DT_REG);
  if (info->NextEntryOffset) directory->offset += info->NextEntryOffset;
  else directory->buffered = false;
  return &directory->entry;
}
int mkdir(const char* path, int) { const auto name = wide(path); return CreateDirectoryW(name.c_str(), nullptr) ? 0 : fail(); }
int mkdirat(int parent, const char* name, int) { return relativeHandle(parent, name, FILE_LIST_DIRECTORY, FILE_CREATE, FILE_DIRECTORY_FILE | FILE_OPEN_REPARSE_POINT) ? 0 : -1; }
char* mkdtemp(char* pattern) {
  const size_t size = std::strlen(pattern);
  if (size < 6 || std::strcmp(pattern + size - 6, "XXXXXX") != 0) { errno = EINVAL; return nullptr; }
  constexpr char alphabet[] = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (int attempt = 0; attempt < 100; ++attempt) {
    std::array<unsigned char, 6> bytes{};
    if (BCryptGenRandom(nullptr, bytes.data(), static_cast<ULONG>(bytes.size()), BCRYPT_USE_SYSTEM_PREFERRED_RNG) < 0) { errno = EIO; return nullptr; }
    for (size_t i = 0; i < bytes.size(); ++i) pattern[size - 6 + i] = alphabet[bytes[i] % 36];
    if (fsapi::mkdir(pattern, 0700) == 0) return pattern;
    if (errno != EEXIST) return nullptr;
  }
  errno = EEXIST;
  return nullptr;
}
int unlinkat(int parent, const char* name, int flags) { return removeHandle(relativeHandle(parent, name, DELETE | FILE_READ_ATTRIBUTES, FILE_OPEN, FILE_OPEN_REPARSE_POINT), (flags & AT_REMOVEDIR) != 0); }
int unlink(const char* path) { return removeHandle(pathHandle(path, DELETE | FILE_READ_ATTRIBUTES, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT), false); }
int rmdir(const char* path) { return removeHandle(pathHandle(path, DELETE | FILE_READ_ATTRIBUTES, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS | FILE_FLAG_OPEN_REPARSE_POINT), true); }
int renameat(int fromParent, const char* from, int toParent, const char* to) {
  if (!component(to)) return -1;
  auto source = relativeHandle(fromParent, from, DELETE, FILE_OPEN, FILE_OPEN_REPARSE_POINT);
  if (!source) return -1;
  const auto name = wide(to);
  const size_t size = sizeof(FILE_RENAME_INFO) + name.size() * sizeof(wchar_t);
  auto storage = std::make_unique<std::byte[]>(size);
  auto* info = reinterpret_cast<FILE_RENAME_INFO*>(storage.get());
  info->ReplaceIfExists = TRUE;
  info->RootDirectory = handle(toParent);
  info->FileNameLength = static_cast<DWORD>(name.size() * sizeof(wchar_t));
  std::memcpy(info->FileName, name.data(), info->FileNameLength);
  IO_STATUS_BLOCK status{};
  const NTSTATUS result = NtSetInformationFile(source.get(), &status, info, static_cast<ULONG>(size), NativeFileInformationClass::Rename);
  return result >= 0 ? 0 : fail(RtlNtStatusToDosError(result));
}
int rename(const char* from, const char* to) { const auto source = wide(from), target = wide(to); return MoveFileExW(source.c_str(), target.c_str(), MOVEFILE_REPLACE_EXISTING) ? 0 : fail(); }
char* realpath(const char* path, char* output) {
  auto value = pathHandle(path, FILE_READ_ATTRIBUTES, OPEN_EXISTING, FILE_FLAG_BACKUP_SEMANTICS);
  if (!value) return nullptr;
  std::vector<wchar_t> buffer(32768);
  const DWORD size = GetFinalPathNameByHandleW(value.get(), buffer.data(), static_cast<DWORD>(buffer.size()), FILE_NAME_NORMALIZED | VOLUME_NAME_DOS);
  if (!size || size >= buffer.size()) { fail(); return nullptr; }
  auto result = utf8(buffer.data(), static_cast<int>(size));
  if (result.starts_with("\\\\?\\UNC\\")) result = "//" + result.substr(8);
  else if (result.starts_with("\\\\?\\")) result.erase(0, 4);
  std::replace(result.begin(), result.end(), '\\', '/');
  if (result.size() >= PATH_MAX) { errno = ENAMETOOLONG; return nullptr; }
  std::memcpy(output, result.c_str(), result.size() + 1);
  return output;
}
}
