#include "nodetool/realtime/offline_gpu.h"
#include <webgpu/webgpu.h>
#include <webgpu/wgpu.h>
#include <algorithm>
#include <array>
#include <atomic>
#include <cmath>
#include <cstring>
#include <map>
#include <stdexcept>
#include <thread>
#include <type_traits>

namespace nt::realtime {
namespace {
// Owner-thread-only RAII. C callbacks adopt returned handles immediately.
template<class T, auto release> struct Release { void operator()(T value) const noexcept { if (value) { release(value); } } };
template<class T, auto release> using Handle = std::unique_ptr<std::remove_pointer_t<T>, Release<T, release>>;
using Instance = Handle<WGPUInstance, wgpuInstanceRelease>;
using Adapter = Handle<WGPUAdapter, wgpuAdapterRelease>;
using Device = Handle<WGPUDevice, wgpuDeviceRelease>;
using Queue = Handle<WGPUQueue, wgpuQueueRelease>;
using Texture = Handle<WGPUTexture, wgpuTextureRelease>;
using View = Handle<WGPUTextureView, wgpuTextureViewRelease>;
using Buffer = Handle<WGPUBuffer, wgpuBufferRelease>;
using Shader = Handle<WGPUShaderModule, wgpuShaderModuleRelease>;
using Layout = Handle<WGPUBindGroupLayout, wgpuBindGroupLayoutRelease>;
using PipelineLayout = Handle<WGPUPipelineLayout, wgpuPipelineLayoutRelease>;
using RenderPipeline = Handle<WGPURenderPipeline, wgpuRenderPipelineRelease>;
using ComputePipeline = Handle<WGPUComputePipeline, wgpuComputePipelineRelease>;
using BindGroup = Handle<WGPUBindGroup, wgpuBindGroupRelease>;
using Sampler = Handle<WGPUSampler, wgpuSamplerRelease>;
using Encoder = Handle<WGPUCommandEncoder, wgpuCommandEncoderRelease>;
using Commands = Handle<WGPUCommandBuffer, wgpuCommandBufferRelease>;
using RenderPass = Handle<WGPURenderPassEncoder, wgpuRenderPassEncoderRelease>;
using ComputePass = Handle<WGPUComputePassEncoder, wgpuComputePassEncoderRelease>;
WGPUStringView view(std::string_view value) { return {value.data(), value.size()}; }
std::string text(WGPUStringView value) { return value.data ? std::string(value.data, value.length == WGPU_STRLEN ? std::strlen(value.data) : value.length) : std::string{}; }
void require(bool condition, const char* reason) { if (!condition) { throw std::runtime_error(reason); } }
// Prepare-thread callback record remains alive until the scope callback finishes.
void popErrors(WGPUInstance instance, WGPUDevice device) {
    struct Scope { std::string error; std::atomic<bool> done{false}; } scope;
    WGPUPopErrorScopeCallbackInfo cb = WGPU_POP_ERROR_SCOPE_CALLBACK_INFO_INIT; cb.mode = WGPUCallbackMode_AllowProcessEvents; cb.userdata1 = &scope;
    cb.callback = [](WGPUPopErrorScopeStatus status, WGPUErrorType type, WGPUStringView message, void* user, void*) {
        auto& state = *static_cast<Scope*>(user);
        if (status != WGPUPopErrorScopeStatus_Success || type != WGPUErrorType_NoError) { state.error = "GPU preparation validation: " + text(message); }
        state.done.store(true, std::memory_order_release);
    };
    wgpuDevicePopErrorScope(device, cb);
    while (!scope.done.load(std::memory_order_acquire)) { wgpuDevicePoll(device, false, nullptr); wgpuInstanceProcessEvents(instance); std::this_thread::yield(); }
    if (!scope.error.empty()) { throw std::runtime_error(scope.error); }
}
WGPUTextureFormat format(RenderFormat value) { return value == RenderFormat::rgba16float ? WGPUTextureFormat_RGBA16Float : WGPUTextureFormat_RGBA8Unorm; }
// Private-device callbacks can arrive from the driver. Only atomics cross threads.
struct Status { std::atomic<bool> failed{false}; };
// Readback callback state outlives the device. 0 idle, 1 pending, 2 ready, 3 failed.
struct ReadState { std::atomic<unsigned> state{0}; std::uint64_t frame = 0; };
// Owner-thread-only prepared uniform packing instruction.
struct Field { unsigned offset = 0; unsigned width = 1; unsigned type = 0; };
// Owner-thread-only cached binding variant. Indices order: inputs, then output.
struct Variant { std::vector<unsigned> textures; BindGroup group; };
// Owner-thread-only pipeline and its precreated binding variants.
struct Pass {
    Layout layout;
    RenderPipeline render;
    ComputePipeline compute;
    std::vector<Sampler> samplers;
    std::vector<Field> fields;
    std::vector<Variant> variants;
    std::size_t offset = 0;
    unsigned size = 0;
    std::array<unsigned, 3> workgroup{1, 1, 1};
    RenderTextureSpec output;
};
Shader shader(WGPUDevice device, std::string_view source) {
    WGPUShaderSourceWGSL wgsl = WGPU_SHADER_SOURCE_WGSL_INIT; wgsl.code = view(source);
    WGPUShaderModuleDescriptor descriptor = WGPU_SHADER_MODULE_DESCRIPTOR_INIT; descriptor.nextInChain = &wgsl.chain;
    return Shader(wgpuDeviceCreateShaderModule(device, &descriptor));
}
Texture texture(WGPUDevice device, const RenderTextureSpec& spec) {
    WGPUTextureDescriptor descriptor = WGPU_TEXTURE_DESCRIPTOR_INIT;
    descriptor.size = {spec.width, spec.height, 1}; descriptor.format = format(spec.format);
    descriptor.usage = WGPUTextureUsage_TextureBinding | WGPUTextureUsage_StorageBinding | WGPUTextureUsage_RenderAttachment | WGPUTextureUsage_CopySrc | WGPUTextureUsage_CopyDst;
    return Texture(wgpuDeviceCreateTexture(device, &descriptor));
}
Buffer buffer(WGPUDevice device, std::size_t size, WGPUBufferUsage usage) {
    WGPUBufferDescriptor descriptor = WGPU_BUFFER_DESCRIPTOR_INIT; descriptor.size = size; descriptor.usage = usage;
    return Buffer(wgpuDeviceCreateBuffer(device, &descriptor));
}
void renderPass(WGPUCommandEncoder encoder, WGPURenderPipeline pipeline, WGPUBindGroup group, WGPUTextureView target, const std::uint32_t* offset = nullptr) {
    WGPURenderPassColorAttachment color = WGPU_RENDER_PASS_COLOR_ATTACHMENT_INIT;
    color.view = target; color.loadOp = WGPULoadOp_Clear; color.storeOp = WGPUStoreOp_Store;
    WGPURenderPassDescriptor descriptor = WGPU_RENDER_PASS_DESCRIPTOR_INIT; descriptor.colorAttachmentCount = 1; descriptor.colorAttachments = &color;
    RenderPass pass(wgpuCommandEncoderBeginRenderPass(encoder, &descriptor));
    wgpuRenderPassEncoderSetPipeline(pass.get(), pipeline); wgpuRenderPassEncoderSetBindGroup(pass.get(), 0, group, offset ? 1 : 0, offset);
    wgpuRenderPassEncoderDraw(pass.get(), 3, 1, 0, 0); wgpuRenderPassEncoderEnd(pass.get());
}
RenderPipeline pipeline(WGPUDevice device, WGPUBindGroupLayout layout, WGPUShaderModule module,
    std::string_view vertex, std::string_view fragment, WGPUTextureFormat target, WGPUInstance instance) {
    WGPUPipelineLayoutDescriptor ld = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT; ld.bindGroupLayoutCount = 1; ld.bindGroupLayouts = &layout;
    PipelineLayout pl(wgpuDeviceCreatePipelineLayout(device, &ld));
    popErrors(instance, device); wgpuDevicePushErrorScope(device, WGPUErrorFilter_Validation);
    WGPUColorTargetState color = WGPU_COLOR_TARGET_STATE_INIT; color.format = target;
    WGPUFragmentState fs = WGPU_FRAGMENT_STATE_INIT; fs.module = module; fs.entryPoint = view(fragment); fs.targetCount = 1; fs.targets = &color;
    WGPURenderPipelineDescriptor descriptor = WGPU_RENDER_PIPELINE_DESCRIPTOR_INIT;
    descriptor.layout = pl.get(); descriptor.vertex.module = module; descriptor.vertex.entryPoint = view(vertex); descriptor.fragment = &fs;
    return RenderPipeline(wgpuDeviceCreateRenderPipeline(device, &descriptor));
}
}

// One offline host thread owns all resources. Callback state is declared first
// so it is destroyed last, after instance/device callback dispatch has ended.
struct OfflineGpu::Storage {
    Status status;
    std::array<ReadState, 3> reads;
    Instance instance;
    Adapter adapter;
    Device device;
    Queue queue;
    std::unique_ptr<RenderSchedule> schedule;
    std::vector<Texture> textures;
    std::vector<View> views;
    Texture white;
    View whiteView;
    std::vector<Pass> passes;
    Buffer uniforms;
    std::vector<std::byte> uniformBytes;
    Texture target;
    View targetView;
    Layout presentLayout;
    RenderPipeline presenter;
    std::vector<BindGroup> presentGroups;
    std::array<Buffer, 3> staging;
    std::vector<bool> uploaded;
    unsigned width = 0, height = 0, rowStride = 0;
    std::uint64_t frame = 0;
    ~Storage() {
        // Cancellation dispatch runs while callback records are still alive.
        for (auto& item : staging) { if (item) { wgpuBufferUnmap(item.get()); } }
        if (device) { wgpuDeviceDestroy(device.get()); wgpuDevicePoll(device.get(), false, nullptr); }
        if (instance) { wgpuInstanceProcessEvents(instance.get()); }
    }
};
OfflineGpu::OfflineGpu(std::unique_ptr<Storage> storage) : storage_(std::move(storage)) {}
OfflineGpu::~OfflineGpu() = default;
bool OfflineGpu::healthy() const noexcept { return !storage_->status.failed.load(std::memory_order_acquire); }
std::size_t OfflineGpu::readbackBytes() const noexcept { return static_cast<std::size_t>(storage_->width) * storage_->height * 4; }
std::span<const RenderSlotSpec> OfflineGpu::slots() const noexcept { return storage_->schedule->slots(); }
bool OfflineGpu::poll() noexcept {
    wgpuDevicePoll(storage_->device.get(), false, nullptr); wgpuInstanceProcessEvents(storage_->instance.get());
    return healthy();
}
bool OfflineGpu::uploadSlot(unsigned slot, std::span<const std::byte> bytes) noexcept {
    auto& data = *storage_;
    if (!healthy() || slot >= data.schedule->slots().size()) { return false; }
    const auto& spec = data.schedule->slots()[slot].texture;
    if (bytes.size() != spec.bytes()) { return false; }
    WGPUTexelCopyTextureInfo destination = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT; destination.texture = data.textures[slot].get();
    WGPUTexelCopyBufferLayout layout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT;
    layout.bytesPerRow = spec.width * (spec.format == RenderFormat::rgba16float ? 8 : 4); layout.rowsPerImage = spec.height;
    WGPUExtent3D extent{spec.width, spec.height, 1};
    wgpuQueueWriteTexture(data.queue.get(), &destination, bytes.data(), bytes.size(), &layout, &extent);
    data.uploaded[slot] = true; return healthy();
}
bool OfflineGpu::takeReadback(std::span<std::byte> bytes, std::uint64_t& frame) noexcept {
    auto& data = *storage_;
    if (!healthy() || bytes.size() < readbackBytes()) { return false; }
    unsigned oldest = 3;
    for (unsigned i = 0; i < 3; ++i) {
        const auto state = data.reads[i].state.load(std::memory_order_acquire);
        if (state == 3) { data.status.failed.store(true); return false; }
        if (state != 0 && (oldest == 3 || data.reads[i].frame < data.reads[oldest].frame)) { oldest = i; }
    }
    if (oldest == 3 || data.reads[oldest].state.load(std::memory_order_acquire) != 2) { return false; }
    const auto mappedSize = static_cast<std::size_t>(data.rowStride) * data.height;
    const auto* mapped = static_cast<const std::byte*>(wgpuBufferGetConstMappedRange(data.staging[oldest].get(), 0, mappedSize));
    if (!mapped) { data.status.failed.store(true); return false; }
    for (unsigned row = 0; row < data.height; ++row) { std::memcpy(bytes.data() + static_cast<std::size_t>(row) * data.width * 4, mapped + static_cast<std::size_t>(row) * data.rowStride, data.width * 4); }
    frame = data.reads[oldest].frame; wgpuBufferUnmap(data.staging[oldest].get()); data.reads[oldest].state.store(0, std::memory_order_release);
    return true;
}

OfflineFrameResult OfflineGpu::render(const RenderFrameInput& input, bool readback) noexcept {
    auto& data = *storage_;
    if (!healthy() || data.frame == std::numeric_limits<std::uint64_t>::max() ||
        std::find(data.uploaded.begin(), data.uploaded.end(), false) != data.uploaded.end()) { return {}; }
    unsigned staging = 3;
    if (readback) {
        for (unsigned i = 0; i < 3; ++i) { if (data.reads[i].state.load(std::memory_order_acquire) == 0) { staging = i; break; } }
        // Backpressure rejects before advancing the schedule or writing the queue.
        if (staging == 3) { return {}; }
    }
    auto frameInput = input; frameInput.targetChanged = input.targetChanged || readback;
    const auto frame = data.schedule->beginFrame(frameInput);
    if (!frame.accepted || !frame.present) { return {frame.accepted, false, false}; }
    const auto reject = [&]() { data.schedule->completeFrame(false); return OfflineFrameResult{}; };
    // Validate/pack all uniforms before staging a queue write or encoding work.
    for (const auto& command : frame.commands) {
        auto& pass = data.passes[command.pass];
        for (unsigned i = 0; i < pass.fields.size(); ++i) {
            const auto& field = pass.fields[i]; const auto& value = command.uniforms[i];
            if (value.width != field.width) { return reject(); }
            for (unsigned lane = 0; lane < field.width; ++lane) {
                const auto number = value.lanes[lane]; auto* output = data.uniformBytes.data() + pass.offset + field.offset + lane * 4;
                if (field.type == 0) {
                    if (std::abs(number) > std::numeric_limits<float>::max()) { return reject(); }
                    const auto packed = static_cast<float>(number); std::memcpy(output, &packed, 4);
                } else {
                    double modulo = std::fmod(std::trunc(number), 4294967296.0); if (modulo < 0) { modulo += 4294967296.0; }
                    const auto packed = static_cast<std::uint32_t>(modulo); std::memcpy(output, &packed, 4);
                }
            }
        }
    }
    WGPUCommandEncoderDescriptor ed = WGPU_COMMAND_ENCODER_DESCRIPTOR_INIT;
    Encoder encoder(wgpuDeviceCreateCommandEncoder(data.device.get(), &ed));
    if (!encoder) { return reject(); }
    for (const auto& command : frame.commands) {
        auto& pass = data.passes[command.pass];
        const auto variant = std::lower_bound(pass.variants.begin(), pass.variants.end(), command,
            [](const Variant& cached, const RenderCommand& requested) {
                for (unsigned i = 0; i < requested.inputs.size(); ++i) {
                    if (cached.textures[i] != requested.inputs[i]) { return cached.textures[i] < requested.inputs[i]; }
                }
                return cached.textures.back() < requested.output;
            });
        if (variant == pass.variants.end() || variant->textures.back() != command.output ||
            !std::equal(command.inputs.begin(), command.inputs.end(), variant->textures.begin())) { return reject(); }
        const auto offset = static_cast<std::uint32_t>(pass.offset);
        if (pass.render) { renderPass(encoder.get(), pass.render.get(), variant->group.get(), data.views[command.output].get(), pass.size ? &offset : nullptr); }
        else {
            WGPUComputePassDescriptor pd = WGPU_COMPUTE_PASS_DESCRIPTOR_INIT;
            ComputePass encoded(wgpuCommandEncoderBeginComputePass(encoder.get(), &pd));
            wgpuComputePassEncoderSetPipeline(encoded.get(), pass.compute.get());
            wgpuComputePassEncoderSetBindGroup(encoded.get(), 0, variant->group.get(), pass.size ? 1 : 0, pass.size ? &offset : nullptr);
            wgpuComputePassEncoderDispatchWorkgroups(encoded.get(), 1 + (pass.output.width - 1) / pass.workgroup[0],
                1 + (pass.output.height - 1) / pass.workgroup[1], 1);
            wgpuComputePassEncoderEnd(encoded.get());
        }
    }
    renderPass(encoder.get(), data.presenter.get(), data.presentGroups[frame.source].get(), data.targetView.get());
    if (readback) {
        WGPUTexelCopyTextureInfo source = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT; source.texture = data.target.get();
        WGPUTexelCopyBufferInfo destination = WGPU_TEXEL_COPY_BUFFER_INFO_INIT;
        destination.buffer = data.staging[staging].get(); destination.layout.bytesPerRow = data.rowStride; destination.layout.rowsPerImage = data.height;
        WGPUExtent3D extent{data.width, data.height, 1};
        wgpuCommandEncoderCopyTextureToBuffer(encoder.get(), &source, &destination, &extent);
    }
    WGPUCommandBufferDescriptor cd = WGPU_COMMAND_BUFFER_DESCRIPTOR_INIT;
    Commands commands(wgpuCommandEncoderFinish(encoder.get(), &cd));
    if (!commands || !healthy()) { return reject(); }
    if (!frame.commands.empty() && !data.uniformBytes.empty()) {
        wgpuQueueWriteBuffer(data.queue.get(), data.uniforms.get(), 0, data.uniformBytes.data(), data.uniformBytes.size());
    }
    const auto submitted = commands.get(); wgpuQueueSubmit(data.queue.get(), 1, &submitted);
    if (readback) {
        auto& state = data.reads[staging]; state.frame = data.frame; state.state.store(1, std::memory_order_release);
        WGPUBufferMapCallbackInfo cb = WGPU_BUFFER_MAP_CALLBACK_INFO_INIT; cb.mode = WGPUCallbackMode_AllowProcessEvents;
        cb.userdata1 = &state;
        cb.callback = [](WGPUMapAsyncStatus status, WGPUStringView, void* user, void*) {
            static_cast<ReadState*>(user)->state.store(status == WGPUMapAsyncStatus_Success ? 2u : 3u, std::memory_order_release);
        };
        wgpuBufferMapAsync(data.staging[staging].get(), WGPUMapMode_Read, 0, static_cast<std::size_t>(data.rowStride) * data.height, cb);
    }
    ++data.frame; const bool success = healthy(); data.schedule->completeFrame(success);
    return {success, success, success && readback};
}

OfflineGpu::Prepared OfflineGpu::prepare(const Plan& plan, const Registry& registry, std::string_view catalogJson, OfflineGpuOptions options) {
    std::string current = "$gpu";
    try {
        require(options.maxBindGroups > 0 && options.maxBindGroups <= 32768, "Bind-group cache limit must be in [1,32768]");
        const auto catalog = Plan::parse(catalogJson);
        require(catalog.at("format") == 1 && catalog.at("modules").is_object(), "Expected a format-1 shader catalog");
        auto data = std::make_unique<Storage>();
        data->width = plan.at("session").at("width"); data->height = plan.at("session").at("height");
        require(data->width > 0 && data->width <= 16384 && data->height > 0 && data->height <= 16384, "Invalid target dimensions");
        const auto targetBytes = static_cast<std::size_t>(data->width) * data->height * 4;
        auto prepared = RenderSchedule::prepare(plan, registry, {options.textureBudget, targetBytes + 4});
        if (!prepared.schedule) { return {nullptr, prepared.error}; }
        require(plan.at("render").contains("present"), "Offline rendering requires a present source");
        data->schedule = std::move(prepared.schedule);
        WGPUInstanceDescriptor id = WGPU_INSTANCE_DESCRIPTOR_INIT;
        data->instance.reset(wgpuCreateInstance(&id)); require(bool(data->instance), "Cannot create WebGPU instance");
        // These request callbacks finish before their prepare-local records leave scope.
        struct AdapterRequest { Adapter value; std::string error; std::atomic<bool> done{false}; } adapter;
        WGPURequestAdapterOptions ao = WGPU_REQUEST_ADAPTER_OPTIONS_INIT; ao.forceFallbackAdapter = options.softwareAdapter;
        WGPURequestAdapterCallbackInfo ac = WGPU_REQUEST_ADAPTER_CALLBACK_INFO_INIT; ac.mode = WGPUCallbackMode_AllowProcessEvents; ac.userdata1 = &adapter;
        ac.callback = [](WGPURequestAdapterStatus status, WGPUAdapter value, WGPUStringView message, void* user, void*) {
            auto& request = *static_cast<AdapterRequest*>(user); request.value.reset(value);
            if (status != WGPURequestAdapterStatus_Success) { request.error = text(message); }
            request.done.store(true, std::memory_order_release);
        };
        wgpuInstanceRequestAdapter(data->instance.get(), &ao, ac);
        while (!adapter.done.load(std::memory_order_acquire)) { wgpuInstanceProcessEvents(data->instance.get()); std::this_thread::yield(); }
        if (!adapter.error.empty() || !adapter.value) { throw std::runtime_error("No requested GPU adapter: " + adapter.error); }
        data->adapter = std::move(adapter.value);
        struct DeviceRequest { Device value; std::string error; std::atomic<bool> done{false}; } device;
        WGPUDeviceDescriptor dd = WGPU_DEVICE_DESCRIPTOR_INIT;
        dd.uncapturedErrorCallbackInfo.userdata1 = &data->status;
        dd.uncapturedErrorCallbackInfo.callback = [](WGPUDevice const*, WGPUErrorType, WGPUStringView, void* user, void*) { static_cast<Status*>(user)->failed.store(true, std::memory_order_release); };
        dd.deviceLostCallbackInfo.mode = WGPUCallbackMode_AllowProcessEvents; dd.deviceLostCallbackInfo.userdata1 = &data->status;
        dd.deviceLostCallbackInfo.callback = [](WGPUDevice const*, WGPUDeviceLostReason, WGPUStringView, void* user, void*) { static_cast<Status*>(user)->failed.store(true, std::memory_order_release); };
        WGPURequestDeviceCallbackInfo dc = WGPU_REQUEST_DEVICE_CALLBACK_INFO_INIT; dc.mode = WGPUCallbackMode_AllowProcessEvents; dc.userdata1 = &device;
        dc.callback = [](WGPURequestDeviceStatus status, WGPUDevice value, WGPUStringView message, void* user, void*) {
            auto& request = *static_cast<DeviceRequest*>(user); request.value.reset(value);
            if (status != WGPURequestDeviceStatus_Success) { request.error = text(message); }
            request.done.store(true, std::memory_order_release);
        };
        wgpuAdapterRequestDevice(data->adapter.get(), &dd, dc);
        while (!device.done.load(std::memory_order_acquire)) { wgpuInstanceProcessEvents(data->instance.get()); std::this_thread::yield(); }
        if (!device.error.empty() || !device.value) { throw std::runtime_error("Cannot create private GPU device: " + device.error); }
        data->device = std::move(device.value); data->queue.reset(wgpuDeviceGetQueue(data->device.get()));
        WGPULimits limits = WGPU_LIMITS_INIT; require(wgpuDeviceGetLimits(data->device.get(), &limits) == WGPUStatus_Success, "Cannot query GPU limits");
        const auto alignment = limits.minUniformBufferOffsetAlignment;
        require(alignment != 0, "Invalid uniform buffer alignment");
        // RT-F44 offline exception: one private device, one thread, preparation only.
        wgpuDevicePushErrorScope(data->device.get(), WGPUErrorFilter_Validation);
        const auto checkpoint = [&] {
            popErrors(data->instance.get(), data->device.get());
            require(!data->status.failed.load(), "Device failed during preparation");
            wgpuDevicePushErrorScope(data->device.get(), WGPUErrorFilter_Validation);
        };
        for (const auto& spec : data->schedule->textures()) {
            require(spec.width <= limits.maxTextureDimension2D && spec.height <= limits.maxTextureDimension2D, "Texture exceeds device limits");
            data->textures.push_back(texture(data->device.get(), spec)); checkpoint(); require(bool(data->textures.back()), "Texture creation failed");
            data->views.emplace_back(wgpuTextureCreateView(data->textures.back().get(), nullptr));
            checkpoint();
        }
        data->white = texture(data->device.get(), {1, 1, RenderFormat::rgba8unorm}); checkpoint();
        data->whiteView.reset(wgpuTextureCreateView(data->white.get(), nullptr)); checkpoint();
        const std::array<std::uint8_t, 4> white{255, 255, 255, 255};
        WGPUTexelCopyTextureInfo whiteTarget = WGPU_TEXEL_COPY_TEXTURE_INFO_INIT; whiteTarget.texture = data->white.get();
        WGPUTexelCopyBufferLayout whiteLayout = WGPU_TEXEL_COPY_BUFFER_LAYOUT_INIT; whiteLayout.bytesPerRow = 4; whiteLayout.rowsPerImage = 1;
        WGPUExtent3D whiteExtent{1, 1, 1}; wgpuQueueWriteTexture(data->queue.get(), &whiteTarget, white.data(), white.size(), &whiteLayout, &whiteExtent); checkpoint();
        // Unreachable slots do not delay a pruned present chain.
        data->uploaded.resize(data->schedule->slots().size(), true);
        data->passes.resize(data->schedule->passes().size());
        std::size_t uniformSize = 0;
        for (unsigned i = 0; i < data->passes.size(); ++i) {
            if (data->schedule->outputCandidates(i).empty()) { continue; }
            const auto& spec = data->schedule->passes()[i]; current = spec.node;
            const auto& module = catalog.at("modules").at(spec.module); auto& pass = data->passes[i]; pass.output = spec.output;
            require(module.at("kind") == "fragment" || module.at("kind") == "compute", "Recipes must be lowered to shader passes");
            require(module.at("io").at("output").value("alpha", "premultiplied") == "premultiplied", "Catalog output must match premultiplied IR contract");
            if (module.contains("uniform") && module["uniform"].is_object()) {
                pass.size = module["uniform"].at("size"); require(pass.size > 0 && pass.size <= limits.maxUniformBufferBindingSize && pass.size % 4 == 0, "Invalid uniform block size");
                std::vector<bool> occupied(pass.size / 4);
                for (const auto& field : module["uniform"].at("fields")) {
                    const auto type = field.at("type").get<std::string>();
                    require(type == "f32" || type == "i32" || type == "u32" || type == "vec2f" || type == "vec3f" || type == "vec4f", "Unsupported uniform field type");
                    const unsigned width = type == "vec2f" ? 2 : type == "vec3f" ? 3 : type == "vec4f" ? 4 : 1;
                    const unsigned offset = field.at("offset");
                    require(offset % 4 == 0 && offset <= pass.size && width * 4 <= pass.size - offset, "Uniform field exceeds block");
                    for (unsigned lane = 0; lane < width; ++lane) { require(!occupied[offset / 4 + lane], "Overlapping uniform fields"); occupied[offset / 4 + lane] = true; }
                    pass.fields.push_back({offset, width, type == "i32" || type == "u32" ? 1u : 0u});
                }
            }
            require(pass.fields.size() == spec.uniformCount, "IR uniforms must follow expanded catalog field order");
            pass.offset = uniformSize; uniformSize += ((static_cast<std::size_t>(pass.size) + alignment - 1) / alignment) * alignment;
            require(uniformSize <= std::min<std::uint64_t>(limits.maxBufferSize, 64ull * 1024 * 1024), "Frame uniform buffer exceeds budget/device limits");
        }
        data->uniformBytes.resize(uniformSize);
        if (uniformSize) { data->uniforms = buffer(data->device.get(), uniformSize, WGPUBufferUsage_Uniform | WGPUBufferUsage_CopyDst); checkpoint(); }
        std::map<std::string, unsigned> slotIds, passIds;
        for (unsigned i = 0; i < data->schedule->slots().size(); ++i) { slotIds.emplace(data->schedule->slots()[i].id, i); }
        for (unsigned i = 0; i < data->schedule->passes().size(); ++i) { passIds.emplace(data->schedule->passes()[i].node, i); }
        unsigned groupCount = 0;
        for (unsigned i = 0; i < data->passes.size(); ++i) {
            if (data->schedule->outputCandidates(i).empty()) { continue; }
            const auto& spec = data->schedule->passes()[i]; current = spec.node; auto& pass = data->passes[i];
            const auto& module = catalog["modules"][spec.module];
            const auto& contracts = module.at("io").at("inputs");
            for (auto contract = contracts.begin(); contract != contracts.end(); ++contract) {
                const bool bound = std::find(spec.inputs.begin(), spec.inputs.end(), contract.key()) != spec.inputs.end();
                require(bound || contract.value().value("optional", false), "Missing required catalog input");
            }
            for (const auto& name : spec.inputs) {
                require(contracts.contains(name), "IR input absent from catalog");
                const auto source = plan["render"]["passes"][i]["inputs"][name].get<std::string>();
                const bool premultiplied = !slotIds.contains(source) || data->schedule->slots()[slotIds.at(source)].premultiplied;
                if (slotIds.contains(source)) { data->uploaded[slotIds.at(source)] = false; }
                require(premultiplied == (contracts[name].value("alpha", "premultiplied") != "straight"), "Catalog input requires explicit alpha conversion");
            }
            std::vector<WGPUBindGroupLayoutEntry> entries;
            unsigned uniformBindings = 0;
            for (const auto& entry : module.at("layout")) {
                WGPUBindGroupLayoutEntry value = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT;
                value.binding = entry.at("binding"); value.visibility = entry.at("visibility");
                if (entry.contains("buffer")) {
                    require(entry["buffer"].value("type", "uniform") == "uniform", "Only uniform buffer bindings supported");
                    ++uniformBindings;
                    value.buffer.type = WGPUBufferBindingType_Uniform;
                    value.buffer.minBindingSize = pass.size;
                    // Select the prepared pass range at encoding. Static ranges produced
                    // wrong per-pass values in the pinned Windows D3D12 regression.
                    value.buffer.hasDynamicOffset = true;
                }
                else if (entry.contains("texture")) {
                    require(entry["texture"].value("viewDimension", "2d") == "2d" && !entry["texture"].value("multisampled", false), "Only single-sample 2D textures supported");
                    const auto sample = entry["texture"].value("sampleType", "float"); require(sample == "float" || sample == "unfilterable-float", "Unsupported sample type");
                    value.texture.sampleType = sample == "float" ? WGPUTextureSampleType_Float : WGPUTextureSampleType_UnfilterableFloat; value.texture.viewDimension = WGPUTextureViewDimension_2D;
                } else if (entry.contains("storageTexture")) {
                    require(entry["storageTexture"].value("access", "write-only") == "write-only" && entry["storageTexture"].value("viewDimension", "2d") == "2d", "Only write-only 2D storage outputs supported");
                    require(entry["storageTexture"].at("format") == (spec.output.format == RenderFormat::rgba16float ? "rgba16float" : "rgba8unorm"), "Storage format differs from IR");
                    value.storageTexture.access = WGPUStorageTextureAccess_WriteOnly; value.storageTexture.format = format(spec.output.format); value.storageTexture.viewDimension = WGPUTextureViewDimension_2D;
                } else if (entry.contains("sampler")) {
                    const auto type = entry["sampler"].value("type", "filtering"); require(type == "filtering" || type == "non-filtering", "Comparison samplers unsupported");
                    value.sampler.type = type == "filtering" ? WGPUSamplerBindingType_Filtering : WGPUSamplerBindingType_NonFiltering;
                } else { throw std::runtime_error("Unsupported bind layout entry"); }
                entries.push_back(value);
            }
            require(uniformBindings == (pass.size ? 1u : 0u), "Catalog must use one binding for its uniform block");
            WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT; ld.entryCount = entries.size(); ld.entries = entries.data();
            pass.layout.reset(wgpuDeviceCreateBindGroupLayout(data->device.get(), &ld));
            checkpoint();
            const auto code = module.at("kind") == "fragment" ? catalog.at("vertex").get<std::string>() + "\n" + module.at("wgsl").get<std::string>() : module.at("wgsl").get<std::string>();
            auto compiled = shader(data->device.get(), code);
            checkpoint();
            if (module["kind"] == "fragment") { pass.render = pipeline(data->device.get(), pass.layout.get(), compiled.get(), catalog.at("vertexEntryPoint").get<std::string>(), module.at("entryPoint").get<std::string>(), format(spec.output.format), data->instance.get()); }
            else {
                for (unsigned axis = 0; axis < 3; ++axis) { pass.workgroup[axis] = module.at("workgroupSize").at(axis); require(pass.workgroup[axis] > 0, "Zero compute workgroup size"); }
                require(pass.workgroup[2] == 1, "Offline image compute requires workgroup depth one");
                require(pass.workgroup[0] <= limits.maxComputeWorkgroupSizeX && pass.workgroup[1] <= limits.maxComputeWorkgroupSizeY &&
                    pass.workgroup[2] <= limits.maxComputeWorkgroupSizeZ && static_cast<std::uint64_t>(pass.workgroup[0]) * pass.workgroup[1] <= limits.maxComputeInvocationsPerWorkgroup,
                    "Compute workgroup metadata exceeds device limits");
                require(1 + (spec.output.width - 1) / pass.workgroup[0] <= limits.maxComputeWorkgroupsPerDimension &&
                    1 + (spec.output.height - 1) / pass.workgroup[1] <= limits.maxComputeWorkgroupsPerDimension, "Compute dispatch exceeds device limits");
                WGPUPipelineLayoutDescriptor pd = WGPU_PIPELINE_LAYOUT_DESCRIPTOR_INIT; const auto layout = pass.layout.get(); pd.bindGroupLayoutCount = 1; pd.bindGroupLayouts = &layout;
                PipelineLayout pl(wgpuDeviceCreatePipelineLayout(data->device.get(), &pd));
                checkpoint();
                WGPUComputePipelineDescriptor cd = WGPU_COMPUTE_PIPELINE_DESCRIPTOR_INIT; cd.layout = pl.get(); cd.compute.module = compiled.get(); const auto entry = module.at("entryPoint").get<std::string>(); cd.compute.entryPoint = view(entry);
                pass.compute.reset(wgpuDeviceCreateComputePipeline(data->device.get(), &cd));
            }
            checkpoint();
            require(bool(pass.render) || bool(pass.compute), "Pipeline creation failed");
            std::vector<std::vector<unsigned>> candidates;
            for (const auto& name : spec.inputs) {
                const auto source = plan["render"]["passes"][i]["inputs"][name].get<std::string>();
                if (slotIds.contains(source)) { candidates.push_back({slotIds.at(source)}); }
                else { const auto possible = data->schedule->outputCandidates(passIds.at(source)); candidates.emplace_back(possible.begin(), possible.end()); }
            }
            const auto possible = data->schedule->outputCandidates(i); candidates.emplace_back(possible.begin(), possible.end());
            std::size_t combinations = 1;
            for (const auto& set : candidates) { require(!set.empty() && combinations <= options.maxBindGroups / set.size(), "Prepared bind-group combinations exceed limit"); combinations *= set.size(); }
            require(combinations <= options.maxBindGroups - groupCount, "Prepared bind-group cache exceeds limit");
            std::map<std::string, unsigned> samplerIds;
            for (const auto& binding : module.at("bindings")) {
                if (binding.at("kind") != "sampler") { continue; }
                const auto name = binding.at("name").get<std::string>(); const auto& desc = module.at("samplers").at(name);
                WGPUSamplerDescriptor sd = WGPU_SAMPLER_DESCRIPTOR_INIT;
                const auto address = [](const std::string& value) { if (value == "repeat") { return WGPUAddressMode_Repeat; } if (value == "mirror-repeat") { return WGPUAddressMode_MirrorRepeat; } require(value == "clamp-to-edge", "Unknown sampler address mode"); return WGPUAddressMode_ClampToEdge; };
                sd.addressModeU = address(desc.value("addressModeU", "clamp-to-edge")); sd.addressModeV = address(desc.value("addressModeV", "clamp-to-edge")); sd.addressModeW = address(desc.value("addressModeW", "clamp-to-edge"));
                sd.magFilter = desc.value("magFilter", "nearest") == "linear" ? WGPUFilterMode_Linear : WGPUFilterMode_Nearest;
                sd.minFilter = desc.value("minFilter", "nearest") == "linear" ? WGPUFilterMode_Linear : WGPUFilterMode_Nearest;
                sd.mipmapFilter = desc.value("mipmapFilter", "nearest") == "linear" ? WGPUMipmapFilterMode_Linear : WGPUMipmapFilterMode_Nearest;
                sd.lodMinClamp = desc.value("lodMinClamp", 0.0f); sd.lodMaxClamp = desc.value("lodMaxClamp", 32.0f); sd.maxAnisotropy = desc.value("maxAnisotropy", std::uint16_t(1));
                samplerIds.emplace(name, static_cast<unsigned>(pass.samplers.size())); pass.samplers.emplace_back(wgpuDeviceCreateSampler(data->device.get(), &sd));
                checkpoint();
            }
            for (std::size_t variant = 0; variant < combinations; ++variant) {
                Variant cached; cached.textures.resize(candidates.size()); auto remainder = variant;
                for (std::size_t axis = candidates.size(); axis-- > 0;) { cached.textures[axis] = candidates[axis][remainder % candidates[axis].size()]; remainder /= candidates[axis].size(); }
                if (std::find(cached.textures.begin(), cached.textures.end() - 1, cached.textures.back()) != cached.textures.end() - 1) { continue; }
                std::vector<WGPUBindGroupEntry> bound;
                for (const auto& binding : module.at("bindings")) {
                    WGPUBindGroupEntry entry = WGPU_BIND_GROUP_ENTRY_INIT; entry.binding = binding.at("binding");
                    const auto kind = binding.at("kind").get<std::string>(), name = binding.at("name").get<std::string>();
                    if (kind == "uniform") { require(pass.size > 0, "Uniform binding without block"); entry.buffer = data->uniforms.get(); entry.offset = 0; entry.size = pass.size; }
                    else if (kind == "texture") {
                        const auto found = std::find(spec.inputs.begin(), spec.inputs.end(), name);
                        if (found == spec.inputs.end()) { require(contracts.contains(name) && contracts[name].value("optional", false), "Missing declared texture input"); entry.textureView = data->whiteView.get(); }
                        else { entry.textureView = data->views[cached.textures[found - spec.inputs.begin()]].get(); }
                    }
                    else if (kind == "storageTexture") { entry.textureView = data->views[cached.textures.back()].get(); }
                    else if (kind == "sampler") { entry.sampler = pass.samplers[samplerIds.at(name)].get(); }
                    else { throw std::runtime_error("Unsupported binding kind"); }
                    bound.push_back(entry);
                }
                WGPUBindGroupDescriptor bd = WGPU_BIND_GROUP_DESCRIPTOR_INIT; bd.layout = pass.layout.get(); bd.entryCount = bound.size(); bd.entries = bound.data();
                cached.group.reset(wgpuDeviceCreateBindGroup(data->device.get(), &bd)); require(bool(cached.group), "Bind-group creation failed");
                checkpoint();
                pass.variants.push_back(std::move(cached)); ++groupCount;
            }
        }
        current = "$present";
        const auto sourceName = plan["render"]["present"]["source"].get<std::string>();
        if (slotIds.contains(sourceName)) { data->uploaded[slotIds.at(sourceName)] = false; }
        const auto from = slotIds.contains(sourceName) ? data->schedule->slots()[slotIds.at(sourceName)].colorSpace : data->schedule->passes()[passIds.at(sourceName)].colorSpace;
        const auto to = data->schedule->presentationColorSpace();
        require((from == RenderColorSpace::data) == (to == RenderColorSpace::data), "Data presentation cannot imply color conversion");
        const bool straight = slotIds.contains(sourceName) && !data->schedule->slots()[slotIds.at(sourceName)].premultiplied;
        std::string conversion;
        if (from == RenderColorSpace::linear && to != RenderColorSpace::linear && to != RenderColorSpace::data) { conversion = "rgb = select(1.055 * pow(max(rgb, vec3f(0)), vec3f(1.0/2.4)) - 0.055, 12.92 * rgb, rgb <= vec3f(0.0031308));"; }
        if (from != RenderColorSpace::linear && from != RenderColorSpace::data && to == RenderColorSpace::linear) { conversion = "rgb = select(pow(max((rgb + 0.055)/1.055, vec3f(0)), vec3f(2.4)), rgb/12.92, rgb <= vec3f(0.04045));"; }
        const auto presentCode = std::string(R"(
@group(0) @binding(0) var source: texture_2d<f32>;
@vertex fn vertex(@builtin(vertex_index) index: u32) -> @builtin(position) vec4f {
  let x = f32((index << 1u) & 2u); let y = f32(index & 2u);
  return vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
}
@fragment fn fragment(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let dims = textureDimensions(source);
  let uv = position.xy / vec2f()") + std::to_string(data->width) + "," + std::to_string(data->height) + R"();
  let pixel = min(vec2u(uv * vec2f(dims)), dims - vec2u(1));
  let c = textureLoad(source, vec2i(pixel), 0);
  var rgb = )" + (straight ? "c.rgb;" : "select(vec3f(0), c.rgb / max(c.a, 1e-20), c.a > 0.0);") + conversion + R"(
  return vec4f(rgb * c.a, c.a);
})";
        WGPUBindGroupLayoutEntry entry = WGPU_BIND_GROUP_LAYOUT_ENTRY_INIT; entry.binding = 0; entry.visibility = WGPUShaderStage_Fragment; entry.texture.sampleType = WGPUTextureSampleType_Float; entry.texture.viewDimension = WGPUTextureViewDimension_2D;
        WGPUBindGroupLayoutDescriptor ld = WGPU_BIND_GROUP_LAYOUT_DESCRIPTOR_INIT; ld.entryCount = 1; ld.entries = &entry;
        data->presentLayout.reset(wgpuDeviceCreateBindGroupLayout(data->device.get(), &ld)); checkpoint(); auto compiled = shader(data->device.get(), presentCode); checkpoint();
        data->presenter = pipeline(data->device.get(), data->presentLayout.get(), compiled.get(), "vertex", "fragment", WGPUTextureFormat_RGBA8Unorm, data->instance.get()); checkpoint();
        data->target = texture(data->device.get(), {data->width, data->height, RenderFormat::rgba8unorm}); checkpoint(); data->targetView.reset(wgpuTextureCreateView(data->target.get(), nullptr)); checkpoint();
        require(data->views.size() <= options.maxBindGroups - groupCount, "Presenter bind groups exceed cache limit");
        for (const auto& textureView : data->views) {
            WGPUBindGroupEntry binding = WGPU_BIND_GROUP_ENTRY_INIT; binding.binding = 0; binding.textureView = textureView.get();
            WGPUBindGroupDescriptor bd = WGPU_BIND_GROUP_DESCRIPTOR_INIT; bd.layout = data->presentLayout.get(); bd.entryCount = 1; bd.entries = &binding;
            data->presentGroups.emplace_back(wgpuDeviceCreateBindGroup(data->device.get(), &bd));
            checkpoint();
        }
        data->rowStride = (data->width * 4 + 255) & ~255u;
        for (auto& staging : data->staging) { staging = buffer(data->device.get(), static_cast<std::size_t>(data->rowStride) * data->height, WGPUBufferUsage_CopyDst | WGPUBufferUsage_MapRead); checkpoint(); }
        popErrors(data->instance.get(), data->device.get());
        require(!data->status.failed.load(), "Device failed during preparation");
        return {std::make_unique<OfflineGpu>(std::move(data)), std::nullopt};
    } catch (const std::exception& error) { return {nullptr, Diagnostic{current, "offline_gpu", error.what()}}; }
}
}
