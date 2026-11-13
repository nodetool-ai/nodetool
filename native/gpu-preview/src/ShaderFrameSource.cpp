#include "ShaderFrameSource.h"

#include "host/gpu_catalog.h"
#include "host/gpu_device.h"

#include <QCoreApplication>
#include <QJsonDocument>
#include <QJsonObject>
#include <QPointer>

#include <chrono>
#include <condition_variable>
#include <functional>
#include <mutex>
#include <vector>

namespace nt::preview {

namespace gpu = gr::host::gpu;

// What the GUI thread tells the worker. `mutex` guards every member.
struct ShaderWorkerState {
    std::mutex mutex;
    std::condition_variable changed;
    std::string catalog;
    std::string module;
    std::string params = "{}";
    bool running = true;
    bool floatFormat = false;
    bool freePacing = false;
    uint32_t width = 0;
    uint32_t height = 0;
    std::uint64_t revision = 0;  // bumped on every change
};

namespace {

struct Snapshot {
    std::string catalog, module, params;
    bool running = false, floatFormat = false, freePacing = false;
    uint32_t width = 0, height = 0;
    std::uint64_t revision = 0;
};

// The worker thread's body. It owns the device textures of its run and the
// ids of the ring's slots. `source` is used only to post to the GUI thread.
void produce(std::stop_token stop, std::shared_ptr<ShaderWorkerState> state, std::shared_ptr<gpu::FrameRing> ring,
             QPointer<ShaderFrameSource> source, std::function<void(QString)> reportDevice) {
    auto report = [&](const QString& message) {
        // QPointer is checked on the GUI thread inside reportError's queued call.
        QMetaObject::invokeMethod(
            qApp, [source, message] { if (source) source->reportError(message); }, Qt::QueuedConnection);
    };

    gr::GpuOptions options;
    options.enabled = true;
    std::string error;
    std::shared_ptr<gpu::Device> device = gpu::Device::acquire(options, error);
    if (!device) {
        report(QStringLiteral("no GPU device: %1").arg(QString::fromStdString(error)));
        return;
    }
    const gpu::ShareSupport support = device->shareSupport();
    reportDevice(QString::fromStdString(device->description()));
    if (support.backend == gpu::ShareBackend::None) {
        report(QStringLiteral("GPU texture sharing is unavailable: %1").arg(QString::fromStdString(support.reason)));
        return;
    }

    const std::string run = "gpu-preview-" + std::to_string(reinterpret_cast<std::uintptr_t>(state.get()));
    std::vector<uint64_t> ids(ring->capacity(), 0);
    std::shared_ptr<const gpu::Catalog> catalog;
    std::string catalogText;
    std::uint64_t failedRevision = ~std::uint64_t(0);
    std::uint64_t frame = 0;
    const auto start = std::chrono::steady_clock::now();

    std::stop_callback wake(stop, [&] {
        std::lock_guard lock(state->mutex);
        state->changed.notify_all();
    });

    while (!stop.stop_requested()) {
        Snapshot s;
        {
            std::unique_lock lock(state->mutex);
            state->changed.wait(lock, [&] {
                return stop.stop_requested() ||
                       (state->running && state->width > 0 && state->height > 0 && !state->module.empty() &&
                        !state->catalog.empty() && state->revision != failedRevision);
            });
            if (stop.stop_requested()) break;
            s = {state->catalog, state->module, state->params, state->running, state->floatFormat,
                 state->freePacing, state->width, state->height, state->revision};
        }

        if (ring->closed()) break;
        // Display pacing: wait until the frame published last was taken.
        if (!s.freePacing && !ring->waitConsumed(std::chrono::milliseconds(50))) continue;
        const std::optional<size_t> slot = ring->beginWrite();
        if (!slot) {
            ring->waitWritable(std::chrono::milliseconds(50));
            continue;
        }
        try {
            if (s.catalog != catalogText) {
                catalog = gpu::parseCatalog(s.catalog);
                catalogText = s.catalog;
            }
            const gpu::ShareFormat format = s.floatFormat ? gpu::ShareFormat::Rgba16Float : gpu::ShareFormat::Rgba8Unorm;
            std::shared_ptr<gpu::SharedTexture> texture = ring->texture(*slot);
            if (!texture || texture->descriptor().width != s.width || texture->descriptor().height != s.height ||
                texture->descriptor().format != format) {
                // A new size or format: this slot gets a new texture. The old
                // one lives until the consumer's import lets go of it.
                if (ids[*slot]) device->release(ids[*slot]);
                ids[*slot] = device->createShareable(s.width, s.height, format, run);
                texture = device->share(ids[*slot]);
                ring->setTexture(*slot, texture);
            }
            gr::Json params = gr::Json::parse(s.params);
            params["time"] = std::chrono::duration<double>(std::chrono::steady_clock::now() - start).count();
            params["frame"] = frame++;
            texture->reclaim();
            device->runInto(*catalog, s.module, params, {}, ids[*slot]);
            const std::chrono::nanoseconds waited = texture->publish();
            ring->publish(*slot, waited);
            QMetaObject::invokeMethod(
                qApp, [source] { if (source) source->notifyFrame(); }, Qt::QueuedConnection);
        } catch (const std::exception& e) {
            ring->abandon(*slot);
            report(QString::fromUtf8(e.what()));
            failedRevision = s.revision;  // wait for a change before trying again
        }
    }
    // The run ends. Textures a consumer still holds stay alive through
    // their SharedTexture; the ids go.
    device->releaseRun(run);
}

}  // namespace

ShaderFrameSource::ShaderFrameSource(QObject* parent)
    : GpuFrameSource(3, parent), m_state(std::make_shared<ShaderWorkerState>()) {
    connect(this, &GpuFrameSource::requestedSizeChanged, this, &ShaderFrameSource::pushState);
    QPointer<ShaderFrameSource> self(this);
    auto reportDevice = [self](QString description) {
        QMetaObject::invokeMethod(
            qApp, [self, description] { if (self) self->setDevice(description); }, Qt::QueuedConnection);
    };
    m_worker = std::jthread(produce, m_state, ring(), self, reportDevice);
}

ShaderFrameSource::~ShaderFrameSource() {
    // Closing the ring ends any wait in the worker; the join below then
    // completes before the members go.
    ring()->close();
    m_worker.request_stop();
    m_worker.join();
}

void ShaderFrameSource::pushState() {
    const QSize size = m_frameSize.isEmpty() ? requestedSize() : m_frameSize;
    {
        std::lock_guard lock(m_state->mutex);
        m_state->catalog = m_catalog.toStdString();
        m_state->module = m_module.toStdString();
        m_state->params = QJsonDocument(QJsonObject::fromVariantMap(m_params)).toJson(QJsonDocument::Compact).toStdString();
        m_state->running = m_running;
        m_state->floatFormat = m_format == Rgba16Float;
        m_state->freePacing = m_pacing == Free;
        m_state->width = uint32_t(qBound(0, size.width(), 16384));
        m_state->height = uint32_t(qBound(0, size.height(), 16384));
        ++m_state->revision;
    }
    m_state->changed.notify_all();
}

void ShaderFrameSource::setCatalog(const QString& catalog) {
    if (catalog == m_catalog) return;
    m_catalog = catalog;
    setError({});
    pushState();
    emit catalogChanged();
}

void ShaderFrameSource::setModule(const QString& module) {
    if (module == m_module) return;
    m_module = module;
    setError({});
    pushState();
    emit moduleChanged();
}

void ShaderFrameSource::setParams(const QVariantMap& params) {
    if (params == m_params) return;
    m_params = params;
    pushState();
    emit paramsChanged();
}

void ShaderFrameSource::setRunning(bool running) {
    if (running == m_running) return;
    m_running = running;
    pushState();
    emit runningChanged();
}

void ShaderFrameSource::setFormat(Format format) {
    if (format == m_format) return;
    m_format = format;
    setError({});
    pushState();
    emit formatChanged();
}

void ShaderFrameSource::setPacing(Pacing pacing) {
    if (pacing == m_pacing) return;
    m_pacing = pacing;
    pushState();
    emit pacingChanged();
}

void ShaderFrameSource::setFrameSize(const QSize& size) {
    if (size == m_frameSize) return;
    m_frameSize = size;
    pushState();
    emit frameSizeChanged();
}

void ShaderFrameSource::setDevice(const QString& description) {
    if (description == m_device) return;
    m_device = description;
    emit deviceChanged();
}

}  // namespace nt::preview
