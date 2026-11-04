#include "runtime.hpp"
#include "gpu.hpp"
#include <array>
#include <atomic>
#include <cstdlib>
#include <cstring>
#include <dlfcn.h>
#include <fstream>
#include <limits>
#include <llvm/Support/Error.h>
#include <llvm/Support/JSON.h>
#include <memory>
#include <set>
#include <stdexcept>
#include <unistd.h>
#include <vector>

namespace nw {
namespace {
std::string read(const std::filesystem::path &path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) {
    throw std::runtime_error("cannot open " + path.string());
  }
  return {std::istreambuf_iterator<char>(file),
          std::istreambuf_iterator<char>()};
}
std::size_t number(const llvm::json::Object &object, llvm::StringRef field) {
  auto value = object.getInteger(field);
  if (!value || *value < 0 ||
      static_cast<uint64_t>(*value) > std::numeric_limits<std::size_t>::max()) {
    throw std::runtime_error("invalid manifest integer: " + field.str());
  }
  return static_cast<std::size_t>(*value);
}
std::string string(const llvm::json::Object &object, llvm::StringRef field) {
  auto value = object.getString(field);
  if (!value) {
    throw std::runtime_error("invalid manifest string: " + field.str());
  }
  return value->str();
}
struct Tensor {
  std::string name;
  std::size_t bytes;
};
struct Manifest {
  std::string raw, target;
  std::size_t alignment, scratch;
  std::vector<Tensor> inputs, outputs;
};
Manifest manifest(const std::filesystem::path &artifact) {
  Manifest result;
  result.raw = read(artifact / "manifest.json");
  auto parsed = llvm::json::parse(result.raw);
  if (!parsed) {
    throw std::runtime_error("invalid manifest JSON: " +
                             llvm::toString(parsed.takeError()));
  }
  auto *object = parsed->getAsObject();
  if (!object) {
    throw std::runtime_error("manifest must be an object");
  }
  if (number(*object, "abi_version") != 1) {
    throw std::runtime_error("unsupported artifact ABI");
  }
  const auto target = string(*object, "target");
  result.target = target;
  if (string(*object, "entry") != (target == "cuda" ? "nw_kernel" : "nw_run") ||
      string(*object, "library") !=
          (target == "cuda" ? "kernel.ptx" : "library.so")) {
    throw std::runtime_error("unsupported artifact entry or library");
  }
  if (target != "cpu" && target != "cuda") {
    throw std::runtime_error("invalid artifact target");
  }
  auto mode = string(*object, "mode");
  if (mode != "strict" && mode != "fast") {
    throw std::runtime_error("invalid artifact mode");
  }
  result.alignment = number(*object, "alignment");
  if (result.alignment < sizeof(void *) || result.alignment > 4096 ||
      (result.alignment & (result.alignment - 1))) {
    throw std::runtime_error("invalid artifact alignment");
  }
  result.scratch = number(*object, "scratch_bytes");
  for (auto field : {"inputs", "outputs"}) {
    auto *list = object->getArray(field);
    if (!list) {
      throw std::runtime_error(std::string("invalid tensor list: ") + field);
    }
    if (list->size() > 4096) {
      throw std::runtime_error(
          "manifest exceeds 4096 tensors per binding list");
    }
    std::set<std::string> names;
    auto &tensors =
        std::string(field) == "inputs" ? result.inputs : result.outputs;
    for (auto &entry : *list) {
      auto *tensor = entry.getAsObject();
      if (!tensor) {
        throw std::runtime_error("invalid tensor");
      }
      auto name = string(*tensor, "name");
      if (name.empty() || !names.insert(name).second) {
        throw std::runtime_error("invalid or duplicate tensor name");
      }
      if (string(*tensor, "dtype") != "f32") {
        throw std::runtime_error("unsupported tensor dtype");
      }
      auto *shape = tensor->getArray("shape");
      if (!shape) {
        throw std::runtime_error("missing tensor shape");
      }
      std::size_t bytes = 4;
      for (auto &dim : *shape) {
        auto size = dim.getAsInteger();
        if (!size || *size <= 0 ||
            static_cast<uint64_t>(*size) >
                std::numeric_limits<std::size_t>::max() / bytes) {
          throw std::runtime_error("invalid or overflowing tensor shape");
        }
        bytes *= static_cast<std::size_t>(*size);
      }
      if (bytes != number(*tensor, "bytes")) {
        throw std::runtime_error("tensor byte size disagrees with shape");
      }
      tensors.push_back({name, bytes});
    }
  }
  return result;
}
using OwnedBuffer = std::unique_ptr<void, decltype(&std::free)>;
OwnedBuffer allocate(std::size_t bytes, std::size_t alignment) {
  void *pointer = nullptr;
  if (posix_memalign(&pointer, alignment, bytes ? bytes : alignment)) {
    throw std::runtime_error("buffer allocation failed");
  }
  std::memset(pointer, 0, bytes);
  return OwnedBuffer(pointer, &std::free);
}
void validateBindings(const Bindings &bindings,
                      const std::vector<Tensor> &tensors) {
  if (bindings.size() != tensors.size()) {
    throw std::runtime_error("binding count disagrees with manifest");
  }
  for (const auto &tensor : tensors) {
    if (!bindings.count(tensor.name)) {
      throw std::runtime_error("missing binding: " + tensor.name);
    }
  }
}
} // namespace
struct PreparedExecutable::Impl {
  Manifest spec;
  using Entry = int (*)(const void *const *, std::size_t, void *const *,
                        std::size_t, void *, std::size_t);
  struct CloseLibrary {
    void operator()(void *handle) const {
      if (handle) {
        dlclose(handle);
      }
    }
  };
  std::unique_ptr<void, CloseLibrary> library;
  Entry entry = nullptr;
  std::vector<const void *> inputPointers;
  std::vector<void *> outputPointers;
  std::atomic_flag gpuBusy = ATOMIC_FLAG_INIT;
  std::unique_ptr<GpuRunner> cuda;
  explicit Impl(const std::filesystem::path &artifact)
      : spec(manifest(artifact)) {
    inputPointers.reserve(spec.inputs.size());
    outputPointers.reserve(spec.outputs.size());

    if (spec.target == "cuda") {
      std::vector<std::size_t> inputBytes, outputBytes;
      for (const auto &tensor : spec.inputs) {
        inputBytes.push_back(tensor.bytes);
      }
      for (const auto &tensor : spec.outputs) {
        outputBytes.push_back(tensor.bytes);
      }
      cuda = std::make_unique<GpuRunner>(artifact / "kernel.ptx", inputBytes,
                                         outputBytes);
    } else {
      library.reset(
          dlopen(std::filesystem::absolute(artifact / "library.so").c_str(),
                 RTLD_NOW | RTLD_LOCAL));
      if (!library) {
        throw std::runtime_error(std::string("cannot load artifact: ") +
                                 dlerror());
      }
      entry = reinterpret_cast<Entry>(dlsym(library.get(), "nw_run"));
      if (!entry) {
        throw std::runtime_error("artifact does not export nw_run");
      }
    }
  }
};
PreparedExecutable::PreparedExecutable(const std::filesystem::path &artifact)
    : impl_(std::make_unique<Impl>(artifact)) {}
PreparedExecutable::~PreparedExecutable() = default;
void PreparedExecutable::run(const std::vector<Buffer> &inputs,
                             const std::vector<Buffer> &outputs,
                             Buffer scratch) {
  const auto &spec = impl_->spec;
  if (inputs.size() != spec.inputs.size() ||
      outputs.size() != spec.outputs.size()) {
    throw std::runtime_error("buffer count disagrees with manifest");
  }
  std::array<std::pair<uintptr_t, uintptr_t>, 8193> ranges;
  std::size_t rangeCount = 0;
  auto validate = [&](Buffer buffer, std::size_t bytes) {
    if (buffer.bytes < bytes || (bytes && !buffer.data) ||
        reinterpret_cast<uintptr_t>(buffer.data) % spec.alignment) {
      throw std::runtime_error(
          "buffer size or alignment disagrees with manifest");
    }
    if (!bytes) {
      return;
    }
    auto begin = reinterpret_cast<uintptr_t>(buffer.data);
    if (bytes > std::numeric_limits<uintptr_t>::max() - begin) {
      throw std::runtime_error("buffer address overflow");
    }
    auto end = begin + bytes;
    for (std::size_t i = 0; i < rangeCount; ++i) {
      if (begin < ranges[i].second && ranges[i].first < end) {
        throw std::runtime_error("buffers must not alias");
      }
    }
    ranges[rangeCount++] = {begin, end};
  };
  std::array<const void *, 4096> inputPointers;
  std::array<void *, 4096> outputPointers;
  for (std::size_t i = 0; i < inputs.size(); ++i) {
    validate(inputs[i], spec.inputs[i].bytes);
    inputPointers[i] = inputs[i].data;
  }
  for (std::size_t i = 0; i < outputs.size(); ++i) {
    validate(outputs[i], spec.outputs[i].bytes);
    outputPointers[i] = outputs[i].data;
  }
  validate(scratch, spec.scratch);
  if (impl_->cuda) {
    if (impl_->gpuBusy.test_and_set(std::memory_order_acquire)) {
      throw std::runtime_error(
          "concurrent execution of one CUDA executable is unsupported");
    }
    struct Release {
      std::atomic_flag &flag;
      ~Release() { flag.clear(std::memory_order_release); }
    } release{impl_->gpuBusy};
    impl_->inputPointers.assign(inputPointers.begin(),
                                inputPointers.begin() + inputs.size());
    impl_->outputPointers.assign(outputPointers.begin(),
                                 outputPointers.begin() + outputs.size());
    impl_->cuda->run(impl_->inputPointers, impl_->outputPointers);
  } else {
    int status =
        impl_->entry(inputPointers.data(), inputs.size(), outputPointers.data(),
                     outputs.size(), scratch.data, scratch.bytes);
    if (status) {
      throw std::runtime_error("artifact execution failed with status " +
                               std::to_string(status));
    }
  }
}
std::string inspect(const std::filesystem::path &artifact) {
  return manifest(artifact).raw;
}
void run(const std::filesystem::path &artifact, const Bindings &inputs,
         const Bindings &outputs, std::size_t repeat) {
  const auto spec = manifest(artifact);
  validateBindings(inputs, spec.inputs);
  validateBindings(outputs, spec.outputs);
  if (!repeat) {
    throw std::runtime_error("repeat must be positive");
  }
  std::set<std::filesystem::path> destinations;
  for (const auto &item : outputs) {
    if (!destinations.insert(std::filesystem::weakly_canonical(item.second))
             .second) {
      throw std::runtime_error("outputs must have distinct file paths");
    }
  }
  std::vector<OwnedBuffer> buffers;
  std::vector<const void *> inputPointers;
  std::vector<void *> outputPointers;
  for (const auto &tensor : spec.inputs) {
    auto data = read(inputs.at(tensor.name));
    if (data.size() != tensor.bytes) {
      throw std::runtime_error("wrong input byte size: " + tensor.name);
    }
    auto buffer = allocate(tensor.bytes, spec.alignment);
    std::memcpy(buffer.get(), data.data(), data.size());
    inputPointers.push_back(buffer.get());
    buffers.push_back(std::move(buffer));
  }
  for (const auto &tensor : spec.outputs) {
    auto buffer = allocate(tensor.bytes, spec.alignment);
    outputPointers.push_back(buffer.get());
    buffers.push_back(std::move(buffer));
  }
  auto scratch = allocate(spec.scratch, spec.alignment);
  PreparedExecutable executable(artifact);
  std::vector<nw::Buffer> inputBuffers, outputBuffers;
  for (std::size_t i = 0; i < spec.inputs.size(); ++i) {
    inputBuffers.push_back(
        {const_cast<void *>(inputPointers[i]), spec.inputs[i].bytes});
  }
  for (std::size_t i = 0; i < spec.outputs.size(); ++i) {
    outputBuffers.push_back({outputPointers[i], spec.outputs[i].bytes});
  }
  for (std::size_t i = 0; i < repeat; ++i) {
    executable.run(inputBuffers, outputBuffers, {scratch.get(), spec.scratch});
  }
  std::vector<std::pair<std::filesystem::path, std::filesystem::path>> staged;
  try {
    for (std::size_t i = 0; i < spec.outputs.size(); ++i) {
      auto destination = outputs.at(spec.outputs[i].name);
      auto pattern = destination.string() + ".tmp.XXXXXX";
      std::vector<char> temporary(pattern.begin(), pattern.end());
      temporary.push_back('\0');
      int fd = mkstemp(temporary.data());
      if (fd < 0) {
        throw std::runtime_error("cannot stage output: " +
                                 destination.string());
      }
      close(fd);
      staged.emplace_back(temporary.data(), destination);
      std::ofstream file(staged.back().first,
                         std::ios::binary | std::ios::trunc);
      file.write(static_cast<const char *>(outputPointers[i]),
                 spec.outputs[i].bytes);
      file.close();
      if (!file) {
        throw std::runtime_error("cannot write output: " +
                                 destination.string());
      }
    }
    for (const auto &item : staged) {
      std::filesystem::rename(item.first, item.second);
    }
  } catch (...) {
    for (const auto &item : staged) {
      std::error_code ignored;
      std::filesystem::remove(item.first, ignored);
    }
    throw;
  }
}
} // namespace nw
