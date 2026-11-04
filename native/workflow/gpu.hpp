#pragma once
#include <filesystem>
#include <memory>
#include <string>
#include <utility>
#include <vector>
namespace nw {
void compileGpu(
    const std::string &source, const std::filesystem::path &directory,
    const std::string &mode,
    const std::vector<std::pair<std::string, std::size_t>> &outputs);
class GpuRunner {
public:
  GpuRunner(const std::filesystem::path &ptx,
            const std::vector<std::size_t> &inputBytes,
            const std::vector<std::size_t> &outputBytes);
  ~GpuRunner();
  void run(const std::vector<const void *> &inputs,
           const std::vector<void *> &outputs);

private:
  struct Impl;
  std::unique_ptr<Impl> impl;
};
} // namespace nw
