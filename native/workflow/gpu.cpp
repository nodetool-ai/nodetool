#include "gpu.hpp"
#include <algorithm>
#include <atomic>
#include <cstdint>
#include <cstdlib>
#include <dlfcn.h>
#include <fstream>
#include <llvm/Support/Program.h>
#include <sstream>
#include <stdexcept>

namespace nw {
namespace {
void replace(std::string &s, const std::string &a, const std::string &b) {
  std::size_t p = 0;
  while ((p = s.find(a, p)) != std::string::npos) {
    s.replace(p, a.size(), b);
    p += b.size();
  }
}
} // namespace
void compileGpu(
    const std::string &source, const std::filesystem::path &directory,
    const std::string &mode,
    const std::vector<std::pair<std::string, std::size_t>> &outputs) {
  auto end = source.find("extern \"C\" int nw_run");
  if (end == std::string::npos) {
    throw std::runtime_error("CUDA lowering: missing generated entry point");
  }
  std::string body = source.substr(0, end);
  // Device compilation deliberately has no dependency on CUDA toolkit headers
  // or libdevice.
  std::istringstream lines(body);
  std::string line;
  body.clear();
  while (std::getline(lines, line)) {
    if (line.rfind("#include", 0) != 0) {
      body += line + "\n";
    }
  }
  replace(body, "static inline ", "static __attribute__((device)) inline ");
  replace(body, "std::", "");
  std::string prelude = R"(typedef __SIZE_TYPE__ size_t;
typedef unsigned int uint32_t;
#define INFINITY (__builtin_inff())
__attribute__((device)) inline float fabsf(float x){return __builtin_fabsf(x);}
__attribute__((device)) inline float fminf(float a,float b){return __builtin_fminf(a,b);}
__attribute__((device)) inline float fmaxf(float a,float b){return __builtin_fmaxf(a,b);}
__attribute__((device)) inline float floorf(float a){return __builtin_floorf(a);}
__attribute__((device)) inline float sqrtf(float a){return __builtin_sqrtf(a);}
)";
  body = prelude + body;
  body += "extern \"C\" __attribute__((global)) void nw_kernel(const void* "
          "const* inputs,void* const* outputs){unsigned t,b,d;asm(\"mov.u32 "
          "%0, %%tid.x;\":\"=r\"(t));asm(\"mov.u32 %0, "
          "%%ctaid.x;\":\"=r\"(b));asm(\"mov.u32 %0, "
          "%%ntid.x;\":\"=r\"(d));size_t i=size_t(b)*d+t;\n";
  for (std::size_t k = 0; k < outputs.size(); ++k) {
    body += "if(i<" + std::to_string(outputs[k].second) + ")((float*)outputs[" +
            std::to_string(k) + "])[i]=" + outputs[k].first + "(i,inputs);\n";
  }
  body += "}\n";
  auto path = directory / "kernel.cu";
  std::ofstream file(path);
  file << body;
  file.close();
  auto log = directory / "cuda-build.log";
  auto clang = llvm::sys::findProgramByName("clang++");
  if (!clang) {
    throw std::runtime_error("CUDA compilation requires clang++");
  }
  std::vector<std::string> arguments = {*clang,
                                        "-x",
                                        "cuda",
                                        "--cuda-device-only",
                                        "-nocudainc",
                                        "-nocudalib",
                                        "--cuda-gpu-arch=sm_52",
                                        "-S",
                                        "-O3",
                                        mode == "fast" ? "-ffast-math"
                                                       : "-fno-fast-math",
                                        "-ffp-contract=off",
                                        path.string(),
                                        "-o",
                                        (directory / "kernel.ptx").string()};
  std::vector<llvm::StringRef> refs;
  for (auto &argument : arguments) {
    refs.push_back(argument);
  }
  const std::string logPath = log.string();
  std::vector<std::optional<llvm::StringRef>> redirects = {std::nullopt,
                                                           logPath, logPath};
  std::string error;
  const int status = llvm::sys::ExecuteAndWait(*clang, refs, std::nullopt,
                                               redirects, 60, 2048, &error);
  if (status != 0) {
    std::ifstream diagnostics(log);
    std::ostringstream detail;
    detail << diagnostics.rdbuf();
    throw std::runtime_error("CUDA compilation failed (status " +
                             std::to_string(status) + "): " + error +
                             detail.str());
  }
}
struct GpuRunner::Impl {
  using Ptr = std::uint64_t;
  void *library = nullptr;
  void *context = nullptr;
  void *module = nullptr;
  void *kernel = nullptr;
  int (*ctxSetCurrent)(void *) = nullptr;
  int (*ctxDestroy)(void *) = nullptr;
  int (*moduleUnload)(void *) = nullptr;
  int (*memFree)(Ptr) = nullptr;
  int (*copyHtoD)(Ptr, const void *, std::size_t) = nullptr;
  int (*copyDtoH)(void *, Ptr, std::size_t) = nullptr;
  int (*launch)(void *, unsigned, unsigned, unsigned, unsigned, unsigned,
                unsigned, unsigned, void *, void **, void **) = nullptr;
  int (*synchronize)() = nullptr;
  std::atomic_flag running = ATOMIC_FLAG_INIT;
  std::vector<Ptr> inputs, outputs;
  std::vector<std::size_t> inputBytes, outputBytes;
  Ptr inputTable = 0, outputTable = 0;
  std::size_t count = 0;
  template <class T> T symbol(const char *name) {
    auto p = dlsym(library, name);
    if (!p) {
      throw std::runtime_error(std::string("CUDA driver missing symbol: ") +
                               name);
    }
    return reinterpret_cast<T>(p);
  }
  void check(int status, const char *action) {
    if (status) {
      throw std::runtime_error(std::string("CUDA ") + action +
                               " failed (driver status " +
                               std::to_string(status) + ")");
    }
  }
  ~Impl() {
    if (context && ctxSetCurrent) {
      ctxSetCurrent(context);
    }
    if (memFree) {
      for (auto p : inputs) {
        memFree(p);
      }
      for (auto p : outputs) {
        memFree(p);
      }
      if (inputTable) {
        memFree(inputTable);
      }
      if (outputTable) {
        memFree(outputTable);
      }
    }
    if (module && moduleUnload) {
      moduleUnload(module);
    }
    if (context && ctxDestroy) {
      ctxDestroy(context);
    }
    if (library) {
      dlclose(library);
    }
  }
};
GpuRunner::GpuRunner(const std::filesystem::path &ptx,
                     const std::vector<std::size_t> &inputBytes,
                     const std::vector<std::size_t> &outputBytes)
    : impl(std::make_unique<Impl>()) {
  auto &p = *impl;
  p.inputBytes = inputBytes;
  p.outputBytes = outputBytes;
  p.library = dlopen("libcuda.so.1", RTLD_NOW | RTLD_LOCAL);
  if (!p.library) {
    throw std::runtime_error(
        "CUDA driver unavailable: libcuda.so.1 could not be loaded");
  }
  auto init = p.symbol<int (*)(unsigned)>("cuInit");
  p.check(init(0), "initialization");
  auto deviceGet = p.symbol<int (*)(int *, int)>("cuDeviceGet");
  int device = 0;
  p.check(deviceGet(&device, 0), "device selection");
  p.ctxSetCurrent = p.symbol<int (*)(void *)>("cuCtxSetCurrent");
  auto ctxCreate = p.symbol<int (*)(void **, unsigned, int)>("cuCtxCreate_v2");
  p.ctxDestroy = p.symbol<int (*)(void *)>("cuCtxDestroy_v2");
  p.check(ctxCreate(&p.context, 0, device), "context creation");
  auto moduleLoad = p.symbol<int (*)(void **, const char *)>("cuModuleLoad");
  p.moduleUnload = p.symbol<int (*)(void *)>("cuModuleUnload");
  p.check(moduleLoad(&p.module, ptx.c_str()), "module loading");
  auto getFunction =
      p.symbol<int (*)(void **, void *, const char *)>("cuModuleGetFunction");
  p.check(getFunction(&p.kernel, p.module, "nw_kernel"), "kernel lookup");
  auto alloc = p.symbol<int (*)(Impl::Ptr *, std::size_t)>("cuMemAlloc_v2");
  p.memFree = p.symbol<int (*)(Impl::Ptr)>("cuMemFree_v2");
  p.copyHtoD = p.symbol<int (*)(Impl::Ptr, const void *, std::size_t)>(
      "cuMemcpyHtoD_v2");
  p.copyDtoH =
      p.symbol<int (*)(void *, Impl::Ptr, std::size_t)>("cuMemcpyDtoH_v2");
  p.launch = p.symbol<decltype(p.launch)>("cuLaunchKernel");
  p.synchronize = p.symbol<int (*)()>("cuCtxSynchronize");
  for (auto bytes : inputBytes) {
    Impl::Ptr pointer = 0;
    p.check(alloc(&pointer, std::max<std::size_t>(bytes, 1)),
            "input allocation");
    p.inputs.push_back(pointer);
  }
  for (auto bytes : outputBytes) {
    Impl::Ptr pointer = 0;
    p.check(alloc(&pointer, std::max<std::size_t>(bytes, 1)),
            "output allocation");
    p.outputs.push_back(pointer);
    p.count = std::max(p.count, bytes / sizeof(float));
  }
  p.check(alloc(&p.inputTable,
                std::max<std::size_t>(p.inputs.size() * sizeof(Impl::Ptr), 1)),
          "input table allocation");
  p.check(alloc(&p.outputTable,
                std::max<std::size_t>(p.outputs.size() * sizeof(Impl::Ptr), 1)),
          "output table allocation");
  if (!p.inputs.empty()) {
    p.check(p.copyHtoD(p.inputTable, p.inputs.data(),
                       p.inputs.size() * sizeof(Impl::Ptr)),
            "input table upload");
  }
  p.check(p.copyHtoD(p.outputTable, p.outputs.data(),
                     p.outputs.size() * sizeof(Impl::Ptr)),
          "output table upload");
}
GpuRunner::~GpuRunner() = default;
void GpuRunner::run(const std::vector<const void *> &inputs,
                    const std::vector<void *> &outputs) {
  auto &p = *impl;
  if (p.running.test_and_set(std::memory_order_acquire)) {
    throw std::runtime_error("CUDA prepared executable is already running");
  }
  struct Release {
    std::atomic_flag &flag;
    ~Release() { flag.clear(std::memory_order_release); }
  } release{p.running};
  p.check(p.ctxSetCurrent(p.context), "context activation");
  if (inputs.size() != p.inputs.size() || outputs.size() != p.outputs.size()) {
    throw std::runtime_error("CUDA binding count mismatch");
  }
  for (std::size_t i = 0; i < inputs.size(); ++i) {
    p.check(p.copyHtoD(p.inputs[i], inputs[i], p.inputBytes[i]),
            "input upload");
  }
  void *args[] = {&p.inputTable, &p.outputTable};
  p.check(p.launch(p.kernel, unsigned((p.count + 255) / 256), 1, 1, 256, 1, 1,
                   0, nullptr, args, nullptr),
          "kernel launch");
  p.check(p.synchronize(), "kernel synchronization");
  for (std::size_t i = 0; i < outputs.size(); ++i) {
    p.check(p.copyDtoH(outputs[i], p.outputs[i], p.outputBytes[i]),
            "output download");
  }
}
} // namespace nw
