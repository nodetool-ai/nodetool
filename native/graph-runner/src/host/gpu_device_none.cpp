// Device for a build with NODETOOL_GRAPH_RUNNER_GPU=OFF: there is none.
#include "host/gpu_device.h"

namespace gr::host::gpu {

std::shared_ptr<Device> Device::acquire(const GpuOptions& options, std::string& error) {
  error = options.enabled
              ? "this native runner was built without GPU support (NODETOOL_GRAPH_RUNNER_GPU=OFF)"
              : "the embedder did not enable the GPU (HostOptions::gpu.enabled)";
  return nullptr;
}


}  // namespace gr::host::gpu
