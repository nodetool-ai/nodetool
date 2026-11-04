#pragma once
#include <ATen/Tensor.h>
#include <filesystem>
#include <memory>
#include <vector>

namespace nw {
class PreparedExecutable {
public:
  PreparedExecutable(const std::filesystem::path &artifact,
                     const std::filesystem::path &manifest);
  ~PreparedExecutable();
  PreparedExecutable(const PreparedExecutable &) = delete;
  PreparedExecutable &operator=(const PreparedExecutable &) = delete;
  std::vector<at::Tensor> run(const std::vector<at::Tensor> &inputs);

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};
void run(const std::filesystem::path &artifact,
         const std::filesystem::path &manifest,
         const std::filesystem::path &inputs,
         const std::filesystem::path &outputs, std::size_t repeat);
}
