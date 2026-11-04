#pragma once
#include <filesystem>
#include <map>
#include <memory>
#include <string>
#include <vector>
namespace nw {
using Bindings = std::map<std::string, std::filesystem::path>;
struct Buffer {
  void *data;
  std::size_t bytes;
};
class PreparedExecutable {
public:
  explicit PreparedExecutable(const std::filesystem::path &artifact);
  ~PreparedExecutable();
  PreparedExecutable(const PreparedExecutable &) = delete;
  PreparedExecutable &operator=(const PreparedExecutable &) = delete;
  // CPU calls may run concurrently with separate buffers. One CUDA instance
  // rejects overlap.
  void run(const std::vector<Buffer> &inputs,
           const std::vector<Buffer> &outputs, Buffer scratch);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
std::string inspect(const std::filesystem::path &artifact);
void run(const std::filesystem::path &artifact, const Bindings &inputs,
         const Bindings &outputs, std::size_t repeat);
} // namespace nw
