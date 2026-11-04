#include "runtime.hpp"
#include <array>
#include <atomic>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <llvm/Support/Program.h>
#include <stdexcept>
#include <thread>
#include <unistd.h>

namespace {
void require(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}
template <class F> void rejects(F action, const char *message) {
  bool rejected = false;
  try {
    action();
  } catch (const std::runtime_error &) {
    rejected = true;
  }
  require(rejected, message);
}
struct Directory {
  std::filesystem::path path;
  Directory() {
    std::array<char, 64> pattern{};
    std::string name =
        (std::filesystem::temp_directory_path() / "nw-runtime-XXXXXX").string();
    require(name.size() < pattern.size(), "temporary path too long");
    std::copy(name.begin(), name.end(), pattern.begin());
    auto result = mkdtemp(pattern.data());
    require(result, "cannot create private test directory");
    path = result;
  }
  ~Directory() {
    std::error_code ignored;
    std::filesystem::remove_all(path, ignored);
  }
};
struct Data {
  alignas(64) std::array<float, 16> input{};
  alignas(64) std::array<float, 16> output{};
  std::vector<nw::Buffer> inputs{{input.data(), sizeof(input)}};
  std::vector<nw::Buffer> outputs{{output.data(), sizeof(output)}};
};
} // namespace
int main(int argc, char **argv) {
  try {
    require(argc == 2, "runtime test requires compiler path");
    Directory directory;
    auto graph = (directory.path / "graph.json").string();
    auto artifact = (directory.path / "artifact").string();
    std::ofstream file(graph);
    file << R"({"settings":{"execution":{"kind":"native","version":1}},"nodes":[
      {"id":"x","type":"nodetool.native.Input","properties":{"name":"x","dtype":"f32","shape":[16]}},
      {"id":"two","type":"nodetool.native.Constant","properties":{"dtype":"f32","shape":[],"value":2}},
      {"id":"multiply","type":"nodetool.native.Multiply","properties":{}},
      {"id":"out","type":"nodetool.native.Output","properties":{"name":"out"}}],
      "edges":[{"source":"x","sourceHandle":"output","target":"multiply","targetHandle":"a"},
      {"source":"two","sourceHandle":"output","target":"multiply","targetHandle":"b"},
      {"source":"multiply","sourceHandle":"output","target":"out","targetHandle":"input"}]})";
    file.close();
    require(bool(file), "cannot write test graph");
    std::vector<llvm::StringRef> arguments{argv[1], "compile", graph,
                                           "--output", artifact};
    require(llvm::sys::ExecuteAndWait(argv[1], arguments) == 0,
            "test artifact compilation failed");
    nw::PreparedExecutable executable(artifact);
    Data data;
    for (std::size_t i = 0; i < data.input.size(); ++i) {
      data.input[i] = float(i) - 7;
    }
    for (int repeat = 0; repeat < 5; ++repeat) {
      executable.run(data.inputs, data.outputs, {nullptr, 0});
      for (std::size_t i = 0; i < data.input.size(); ++i) {
        require(data.output[i] == data.input[i] * 2,
                "repeated output mismatch");
      }
    }
    rejects([&] { executable.run({}, data.outputs, {nullptr, 0}); },
            "wrong counts accepted");
    auto bad = data.inputs;
    bad[0].bytes = 4;
    rejects([&] { executable.run(bad, data.outputs, {nullptr, 0}); },
            "short buffer accepted");
    bad[0] = {reinterpret_cast<char *>(data.input.data()) + 1,
              sizeof(data.input)};
    rejects([&] { executable.run(bad, data.outputs, {nullptr, 0}); },
            "misaligned buffer accepted");
    rejects([&] { executable.run(data.inputs, data.inputs, {nullptr, 0}); },
            "aliasing buffers accepted");
    std::atomic<bool> valid{true};
    auto worker = [&](float seed) {
      Data local;
      for (std::size_t i = 0; i < local.input.size(); ++i) {
        local.input[i] = seed + float(i);
      }
      try {
        for (int repeat = 0; repeat < 100; ++repeat) {
          executable.run(local.inputs, local.outputs, {nullptr, 0});
          for (std::size_t i = 0; i < local.input.size(); ++i) {
            if (local.output[i] != local.input[i] * 2) {
              valid.store(false);
            }
          }
        }
      } catch (...) {
        valid.store(false);
      }
    };
    std::thread first(worker, 1), second(worker, 100);
    first.join();
    second.join();
    require(valid.load(), "concurrent CPU invocation failed");
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
