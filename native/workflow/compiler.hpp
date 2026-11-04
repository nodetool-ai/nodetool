#pragma once
#include <string>
namespace nw {
struct CompileResult {
  std::string manifest;
};
CompileResult compile(const std::string &graphPath, const std::string &outDir,
                      const std::string &target, const std::string &mode);
} // namespace nw
