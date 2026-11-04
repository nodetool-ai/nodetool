#include "runtime.hpp"
#include <ATen/ATen.h>
#include <ATen/Version.h>
#include <ATen/detail/CUDAHooksInterface.h>
#include <chrono>
#include <iostream>
#include <sys/resource.h>
#include <dlfcn.h>
#include <sys/utsname.h>
#include <torch/csrc/inductor/aoti_package/model_package_loader.h>
#include <llvm/ADT/StringExtras.h>
#include <llvm/Support/Error.h>
#include <llvm/Support/JSON.h>
#include <llvm/Support/SHA256.h>
#include <cmath>
#include <fstream>
#include <limits>
#include <mutex>
#include <set>
#include <stdexcept>

namespace nw {
namespace {
std::string read(const std::filesystem::path &path) {
  std::ifstream file(path, std::ios::binary);
  if (!file) { throw std::runtime_error("cannot open " + path.string()); }
  return {std::istreambuf_iterator<char>(file), std::istreambuf_iterator<char>()};
}
llvm::json::Value json(const std::filesystem::path &path) {
  auto parsed = llvm::json::parse(read(path));
  if (!parsed) { throw std::runtime_error("invalid JSON: " + llvm::toString(parsed.takeError())); }
  return std::move(*parsed);
}
const llvm::json::Object &object(const llvm::json::Value &value) {
  auto result = value.getAsObject();
  if (!result) { throw std::runtime_error("expected JSON object"); }
  return *result;
}
std::string string(const llvm::json::Object &value, llvm::StringRef key) {
  auto result = value.getString(key);
  if (!result) { throw std::runtime_error("missing string " + key.str()); }
  return result->str();
}
std::vector<int64_t> shape(const llvm::json::Object &value) {
  auto dimensions = value.getArray("shape");
  if (!dimensions) { throw std::runtime_error("missing tensor shape"); }
  std::vector<int64_t> result;
  for (const auto &dimension : *dimensions) {
    auto size = dimension.getAsInteger();
    if (!size || *size <= 0) { throw std::runtime_error("shape dimensions must be positive integers"); }
    result.push_back(*size);
  }
  return result;
}
struct Signature { std::string name; std::vector<int64_t> shape; };
std::vector<Signature> signatures(const llvm::json::Object &manifest, llvm::StringRef key) {
  auto entries = manifest.getArray(key);
  if (!entries || (entries->empty() && key == "outputs")) { throw std::runtime_error("missing signatures: " + key.str()); }
  std::vector<Signature> result;
  std::set<std::string> names;
  for (const auto &entry : *entries) {
    const auto &value = object(entry);
    auto name = string(value, "name");
    if (name.empty() || !names.insert(name).second || string(value, "dtype") != "float32") {
      throw std::runtime_error("invalid tensor signature");
    }
    result.push_back({name, shape(value)});
  }
  return result;
}
void check(const at::Tensor &tensor, const Signature &signature, const c10::Device &device, bool input = true) {
  if (tensor.scalar_type() != at::kFloat || tensor.sizes().vec() != signature.shape ||
      (input && !tensor.is_contiguous()) || tensor.device() != device) {
    throw std::runtime_error("tensor contract mismatch: " + signature.name);
  }
}
void compatibility(const llvm::json::Object &manifest, const std::string &target) {
  auto requirements = manifest.getObject("target_requirements");
  struct utsname host {};
  if (!requirements || uname(&host) != 0 || string(*requirements, "architecture") != host.machine) {
    throw std::runtime_error("artifact architecture is incompatible");
  }
  if (target == "cpu") {
    if (string(*requirements, "cpu_capability") != at::get_cpu_capability()) {
      throw std::runtime_error("artifact CPU capability is incompatible");
    }
    return;
  }
  auto capability = requirements->getArray("cuda_capability");
  if (!capability || capability->size() != 2) { throw std::runtime_error("missing CUDA capability"); }
  auto closeLibrary = [](void *handle) { dlclose(handle); };
  auto library = std::unique_ptr<void, decltype(closeLibrary)>(dlopen("libcuda.so.1", RTLD_NOW | RTLD_LOCAL), closeLibrary);
  if (!library) { throw std::runtime_error("CUDA driver unavailable"); }
  auto initialize = reinterpret_cast<int (*)(unsigned int)>(dlsym(library.get(), "cuInit"));
  auto getDevice = reinterpret_cast<int (*)(int *, int)>(dlsym(library.get(), "cuDeviceGet"));
  auto getCapability = reinterpret_cast<int (*)(int *, int *, int)>(dlsym(library.get(), "cuDeviceComputeCapability"));
  int device = 0, major = 0, minor = 0;
  if (!initialize || !getDevice || !getCapability || initialize(0) != 0 ||
      getDevice(&device, 0) != 0 || getCapability(&major, &minor, device) != 0 ||
      (*capability)[0].getAsInteger() != major || (*capability)[1].getAsInteger() != minor) {
    throw std::runtime_error("artifact CUDA capability is incompatible");
  }
}
float scalar(const llvm::json::Value &value) {
  if (auto number = value.getAsNumber()) { return static_cast<float>(*number); }
  if (auto token = value.getAsString()) {
    if (*token == "-0.0") { return -0.0f; }
    if (*token == "nan") { return std::numeric_limits<float>::quiet_NaN(); }
    if (*token == "inf") { return std::numeric_limits<float>::infinity(); }
    if (*token == "-inf") { return -std::numeric_limits<float>::infinity(); }
  }
  throw std::runtime_error("invalid float32 value");
}
}
struct PreparedExecutable::Impl {
  c10::Device device{c10::kCPU};
  std::vector<Signature> inputs;
  std::vector<Signature> outputs;
  std::unique_ptr<torch::inductor::AOTIModelPackageLoader> loader;
  std::mutex mutex;
};
PreparedExecutable::PreparedExecutable(const std::filesystem::path &artifact,
                                       const std::filesystem::path &manifestPath)
    : impl_(std::make_unique<Impl>()) {
  const auto value = json(manifestPath);
  const auto &manifest = object(value);
  if (manifest.getInteger("version") != 1 || manifest.getInteger("graph_version") != 1 || string(manifest, "torch_version") != NW_TORCH_VERSION) {
    throw std::runtime_error("artifact toolchain or manifest version is incompatible");
  }
  const auto target = string(manifest, "target");
  if (target == "cuda") { impl_->device = c10::Device(c10::kCUDA, 0); }
  else if (target != "cpu") { throw std::runtime_error("unsupported artifact target"); }
  compatibility(manifest, target);
  const auto bytes = read(artifact);
  auto digest = llvm::SHA256::hash(llvm::ArrayRef<uint8_t>(reinterpret_cast<const uint8_t *>(bytes.data()), bytes.size()));
  if (llvm::toHex(digest, true) != string(manifest, "artifact_sha256")) {
    throw std::runtime_error("artifact hash mismatch");
  }
  impl_->inputs = signatures(manifest, "inputs");
  impl_->outputs = signatures(manifest, "outputs");
  impl_->loader = std::make_unique<torch::inductor::AOTIModelPackageLoader>(artifact.string(), "model", false, 1,
                                                                         target == "cuda" ? 0 : -1);
}
PreparedExecutable::~PreparedExecutable() = default;
std::vector<at::Tensor> PreparedExecutable::run(const std::vector<at::Tensor> &inputs) {
  std::unique_lock<std::mutex> lock(impl_->mutex, std::try_to_lock);
  if (!lock.owns_lock()) { throw std::runtime_error("executable already has an in-flight invocation"); }
  if (inputs.size() != impl_->inputs.size()) { throw std::runtime_error("input count mismatch"); }
  for (std::size_t i = 0; i < inputs.size(); ++i) { check(inputs[i], impl_->inputs[i], impl_->device); }
  auto outputs = impl_->loader->run(inputs);
  if (outputs.size() != impl_->outputs.size()) { throw std::runtime_error("output count mismatch"); }
  for (std::size_t i = 0; i < outputs.size(); ++i) { check(outputs[i], impl_->outputs[i], impl_->device, false); }
  return outputs;
}
void run(const std::filesystem::path &artifact, const std::filesystem::path &manifestPath,
         const std::filesystem::path &inputPath, const std::filesystem::path &outputPath,
         std::size_t repeat) {
  if (repeat == 0) { throw std::runtime_error("repeat must be positive"); }
  const auto manifestValue = json(manifestPath);
  const auto &manifest = object(manifestValue);
  const auto contract = signatures(manifest, "inputs");
  const auto outputContract = signatures(manifest, "outputs");
  const auto inputValue = json(inputPath);
  const auto &inputObject = object(inputValue);
  if (inputObject.size() != contract.size()) { throw std::runtime_error("input names mismatch"); }
  const auto device = string(manifest, "target") == "cuda" ? c10::Device(c10::kCUDA, 0) : c10::Device(c10::kCPU);
  auto synchronize = [&device]() {
    if (device.is_cuda()) { at::detail::getCUDAHooks().deviceSynchronize(0); }
  };
  using Clock = std::chrono::steady_clock;
  auto elapsed = [](Clock::time_point start) { return std::chrono::duration<double>(Clock::now() - start).count(); };
  double uploadSeconds = 0;
  std::vector<at::Tensor> inputs;
  for (const auto &signature : contract) {
    auto entry = inputObject.getObject(signature.name);
    if (!entry || shape(*entry) != signature.shape) { throw std::runtime_error("input shape mismatch: " + signature.name); }
    if (auto dtype = entry->getString("dtype"); dtype && *dtype != "float32") { throw std::runtime_error("input dtype mismatch"); }
    auto values = entry->getArray("values");
    auto tensor = at::empty(signature.shape, at::TensorOptions().dtype(at::kFloat).device(at::kCPU));
    if (!values || values->size() != static_cast<std::size_t>(tensor.numel())) { throw std::runtime_error("input value count mismatch"); }
    auto data = tensor.data_ptr<float>();
    for (std::size_t i = 0; i < values->size(); ++i) { data[i] = scalar((*values)[i]); }
    const auto uploadStart = Clock::now();
    inputs.push_back(tensor.to(device));
    synchronize();
    uploadSeconds += elapsed(uploadStart);
  }
  const auto loadStart = Clock::now();
  PreparedExecutable executable(artifact, manifestPath);
  synchronize();
  const auto loadSeconds = elapsed(loadStart);
  const auto firstStart = Clock::now();
  auto outputs = executable.run(inputs);
  synchronize();
  const auto firstSeconds = elapsed(firstStart);
  const auto executionStart = Clock::now();
  for (std::size_t i = 0; i < repeat; ++i) { outputs = executable.run(inputs); }
  synchronize();
  const auto executionSeconds = elapsed(executionStart) / repeat;
  double downloadSeconds = 0;
  llvm::json::Object result;
  for (std::size_t i = 0; i < outputs.size(); ++i) {
    const auto downloadStart = Clock::now();
    const auto tensor = outputs[i].to(at::kCPU).contiguous();
    synchronize();
    downloadSeconds += elapsed(downloadStart);
    llvm::json::Array dimensions, values;
    for (auto dimension : tensor.sizes()) { dimensions.push_back(dimension); }
    const auto data = tensor.const_data_ptr<float>();
    for (int64_t j = 0; j < tensor.numel(); ++j) {
      if (std::isnan(data[j])) { values.push_back("nan"); }
      else if (std::isinf(data[j])) { values.push_back(data[j] > 0 ? "inf" : "-inf"); }
      else if (data[j] == 0 && std::signbit(data[j])) { values.push_back("-0.0"); }
      else { values.push_back(static_cast<double>(data[j])); }
    }
    result[outputContract[i].name] = llvm::json::Object{{"shape", std::move(dimensions)}, {"dtype", "float32"}, {"values", std::move(values)}};
  }
  std::ofstream file(outputPath);
  if (!file) { throw std::runtime_error("cannot write outputs"); }
  file << llvm::formatv("{0:2}", llvm::json::Value(std::move(result))).str() << '\n';
  if (!file) { throw std::runtime_error("writing outputs failed"); }
  struct rusage usage {};
  if (getrusage(RUSAGE_SELF, &usage) != 0) { throw std::runtime_error("reading memory metrics failed"); }
  llvm::json::Object metrics{{"load_seconds", loadSeconds}, {"first_execution_seconds", firstSeconds},
                            {"execution_seconds", executionSeconds}, {"upload_seconds", uploadSeconds},
                            {"download_seconds", downloadSeconds}, {"repeat", static_cast<int64_t>(repeat)},
                            {"peak_host_rss_bytes", static_cast<int64_t>(usage.ru_maxrss) * 1024}};
  std::cerr << llvm::formatv("{0}", llvm::json::Value(std::move(metrics))).str() << '\n';
}
}
