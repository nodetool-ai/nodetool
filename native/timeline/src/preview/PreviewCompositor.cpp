#include "preview/PreviewCompositor.h"

#include "model/TimelineModel.h"
#include "playback/PlaybackClock.h"
#include "preview/SceneEval.h"
#include "preview/FrameRing.h"
#include "platform/CpuUsage.h"
#include "preview/RetireQueue.h"
#include "preview/hw/HwInterop.h"
#include "preview/SourcePool.h"
#include "preview/SurfacePool.h"
#include "preview/SyntheticSource.h"
#include "preview/layers/LayerRegistry.h"
#include "preview/compose/ComposeRegistry.h"

#include <rhi/qrhi.h>

#include <QElapsedTimer>
#include <QFile>
#include <QMatrix4x4>
#include <QPointer>
#include <QQuickWindow>

#include <algorithm>
#include <array>
#include <cstddef>
#include <limits>
#include <optional>
#include <chrono>
#include <cmath>
#include <mutex>
#include <cstdio>
#include <cstring>
#include <memory>
#include <string>
#include <map>
#include <set>
#include <type_traits>

namespace {

// Triangle strip over [-1,1]^2. UV v = 0 is the top row of a source image.
constexpr float kQuad[] = {
    // x,    y,    u,    v
    -1.0f, -1.0f, 0.0f, 1.0f,
     1.0f, -1.0f, 1.0f, 1.0f,
    -1.0f,  1.0f, 0.0f, 0.0f,
     1.0f,  1.0f, 1.0f, 0.0f,
};

// std140 block in composite.vert / composite.frag.
struct LayerUniforms {
    float mvp[16];
    float colorMatrix[16];  // YUV modes: rgb = (colorMatrix * vec4(y, cb, cr, 1)).rgb
    float opacity;
    float flipV;
    float mode;  // 0 RGBA, 1 I420, 2 NV12
    float pad;
    std::array<float, 4> sourceRect{0, 0, 1, 1};
    std::array<float, 4> sourceTexelSize{};
};
static_assert(offsetof(LayerUniforms, sourceRect) == 144);
static_assert(offsetof(LayerUniforms, sourceTexelSize) == 160);
static_assert(sizeof(LayerUniforms) == 176);
static_assert(std::is_same_v<decltype(LayerUniforms::sourceRect), std::array<float, 4>>);
static_assert(std::is_same_v<decltype(LayerUniforms::sourceTexelSize), std::array<float, 4>>);

float modeFor(nt::LayerFrame::Format f) {
    switch (f) {
    case nt::LayerFrame::Format::I420: return 1.0f;
    case nt::LayerFrame::Format::Nv12: return 2.0f;
    default: return 0.0f;
    }
}

size_t surfaceBudgetBytes() {
    bool ok = false;
    const int mib = qEnvironmentVariableIntValue("NT_SURFACE_BUDGET_MIB", &ok);
    return ok && mib > 0 ? static_cast<size_t>(mib) * 1024 * 1024 : nt::SurfacePool<int>::kDefaultBudgetBytes;
}

// Drop a clip's source when it has not drawn for this many frames.
constexpr long long kEvictAfterFrames = 300;

QShader loadShader(const QString& path) {
    QFile f(path);
    if (!f.open(QIODevice::ReadOnly)) {
        qFatal("cannot open shader %s", qPrintable(path));
    }
    return QShader::fromSerialized(f.readAll());
}

void writeMatrix(LayerUniforms& u, const QMatrix4x4& m) {
    std::memcpy(u.mvp, m.constData(), sizeof(u.mvp));
}

}  // namespace

class PreviewCompositorRenderer final : public QQuickRhiItemRenderer {
public:
    ~PreviewCompositorRenderer() override {
        // D11: keep owned textures alive until every sampling command buffer
        // completes. Closing pooled decoders also retires hardware frames.
        for (auto& [key, entry] : m_sources) { retireSource(entry); }
        m_sources.clear();
        m_effectStages.clear();
        m_blendHandlers.clear();
        m_matteStage.reset();
        m_pool.clear();
        m_surfaces.clear();
        if (m_rhi && !m_retire.empty()) m_rhi->finish();
        m_retire.clear();
    }

    PreviewCompositorRenderer()
        : m_steadyOriginNs(std::chrono::duration_cast<std::chrono::nanoseconds>(
                               std::chrono::steady_clock::now().time_since_epoch())
                               .count()) {
        m_clock.start();
    }

protected:
    void initialize(QRhiCommandBuffer* cb) override;
    void synchronize(QQuickRhiItem* item) override;
    void render(QRhiCommandBuffer* cb) override;

private:
    // GPU state of one clip's layer. A media clip's source lives in the
    // pool; registered and synthetic sources are owned here.
    struct SourceEntry {
        std::unique_ptr<nt::LayerSource> ownedSource;
        std::unique_ptr<QRhiBuffer> ubuf;
        std::unique_ptr<QRhiShaderResourceBindings> srb;
        std::array<QRhiTexture*, 3> bound{};
        bool ubufOk = false;
        bool registered = false;
        nt::LayerSourceToken factoryToken = 0;
        long long lastUsedFrame = 0;
    };

    // One pooled intermediate surface (D35): a canvas-sized target the
    // group's children draw into, and the bindings and uniforms that draw it
    // as one layer of its container.
    struct SurfaceResources {
        std::unique_ptr<QRhiTexture> texture;
        std::unique_ptr<QRhiTextureRenderTarget> rt;
        std::unique_ptr<QRhiBuffer> ubuf;
        std::unique_ptr<QRhiShaderResourceBindings> srb;
    };
    struct Surface : SurfaceResources {
        nt::RetireQueue* retire = nullptr;
        long long* frame = nullptr;
        ~Surface() {
            if (retire && frame) {
                retire->retire(std::make_shared<SurfaceResources>(
                    std::move(static_cast<SurfaceResources&>(*this))), *frame);
            }
        }
    };
    struct EffectPass {
        nt::LayerEffectStage* stage;
        nt::LayerFrame input;
        Surface* output;
        const QJsonObject* ext;
        const std::map<std::string, nt::LayerFrame>* sources;
    };
    std::unique_ptr<nt::MatteStage> m_matteStage;
    std::vector<std::unique_ptr<nt::LayerEffectStage>> m_effectStages;
    std::map<std::string, std::unique_ptr<nt::BlendHandler>> m_blendHandlers;
    std::unique_ptr<Surface> makeSurface(QSize size);

    void ensureCanvas();
    void ensureBlitPipeline();
    SourceEntry& entryFor(const nt::ActiveLayer& layer);
    void retireSource(SourceEntry& entry);
    std::unique_ptr<QRhiGraphicsPipeline> makePipeline(QRhiRenderPassDescriptor* rp, bool blend);

    QRhi* m_rhi = nullptr;
    QShader m_vs;
    QShader m_fs;
    std::unique_ptr<QRhiBuffer> m_vbuf;
    std::unique_ptr<QRhiSampler> m_sampler;
    bool m_vbufUploaded = false;

    // Offscreen canvas at the sequence resolution.
    QSize m_canvasSize;
    std::unique_ptr<QRhiTexture> m_canvas;
    std::unique_ptr<QRhiTextureRenderTarget> m_canvasRt;
    std::unique_ptr<QRhiRenderPassDescriptor> m_canvasRp;
    std::unique_ptr<QRhiGraphicsPipeline> m_layerPipeline;

    // Canvas -> item.
    std::unique_ptr<QRhiBuffer> m_blitUbuf;
    std::unique_ptr<QRhiShaderResourceBindings> m_blitSrb;
    std::unique_ptr<QRhiGraphicsPipeline> m_blitPipeline;

    // Declared before the sources and the pool, so it is destroyed after
    // them: their last hardware frames retire into it.
    nt::RetireQueue m_retire;
    std::shared_ptr<nt::hw::PlatformInterop> m_interop;
    std::map<std::pair<std::string, std::string>, SourceEntry> m_sources;
    nt::SourcePool m_pool;
    // Budget: NT_SURFACE_BUDGET_MIB, else 512 MiB (D35).
    nt::SurfacePool<Surface> m_surfaces{[this](QSize size) { return makeSurface(size); }, surfaceBudgetBytes()};

    // Snapshot from synchronize() (D8).
    std::shared_ptr<const nt::Timeline> m_timeline;
    QPointer<TimelineModel> m_sourceModel;
    quint64 m_sourceGeneration = 0;
    double m_timeMs = 0.0;
    std::vector<nt::ActiveLayer> m_layers;
    std::vector<nt::PrecompositeLayer> m_precomposites;  // innermost first
    std::string m_resourceError;  // the first GPU resource failure, for the GUI side
    bool m_warnedOverBudget = false;
    QSize m_wantedCanvas{1920, 1080};
    double m_fps = 30.0;
    bool m_playing = false;
    bool m_canvasDrawn = false;  // the canvas holds a composited picture

    // Stills: a read-back of the canvas, requested in synchronize().
    bool m_captureWanted = false;
    bool m_captureImmediate = false;
    double m_capturedTimeMs = 0.0;
    bool m_captureInFlight = false;
    QRhiReadbackResult m_readback;
    std::mutex m_captureMutex;
    QImage m_captured;
    bool m_waitingForFrames = false;  // a still is pending on decode

    long long m_frame = 0;
    qint64 m_steadyOriginNs;  // steady_clock at m_clock start, so stats share one clock
    QElapsedTimer m_clock;
    qint64 m_lastRenderNs = -1;
    bool m_collectStats = false;
    std::vector<FrameStat> m_pendingStats;
};

PreviewCompositor::PreviewCompositor(QQuickItem* parent) : QQuickRhiItem(parent) {}

void PreviewCompositor::setTimeline(TimelineModel* timeline) {
    if (timeline == m_timeline) {
        return;
    }
    if (m_timeline) {
        disconnect(m_timeline, nullptr, this, nullptr);
    }
    m_timeline = timeline;
    if (m_timeline) {
        connect(m_timeline, &TimelineModel::timelineChanged, this, &QQuickItem::update);
    }
    emit timelineChanged();
    update();
}

void PreviewCompositor::setClock(PlaybackClock* clock) {
    if (clock == m_clock) {
        return;
    }
    if (m_clock) {
        disconnect(m_clock, nullptr, this, nullptr);
    }
    m_clock = clock;
    if (m_clock) {
        // A seek while paused needs one new frame. While playing, the
        // renderer requests the next frame itself.
        connect(m_clock, &PlaybackClock::timeChanged, this, &QQuickItem::update);
        connect(m_clock, &PlaybackClock::playingChanged, this, &QQuickItem::update);
    }
    emit clockChanged();
    update();
}

QQuickRhiItemRenderer* PreviewCompositor::createRenderer() {
    return new PreviewCompositorRenderer();
}

void PreviewCompositorRenderer::initialize(QRhiCommandBuffer*) {
    if (m_rhi != rhi()) {
        // New QRhi (first run, or a device change): drop every resource.
        m_sources.clear();
        m_effectStages.clear();
        m_blendHandlers.clear();
        m_matteStage.reset();
        m_pool.clear();  // stop old decoders before retiring their frames
        m_surfaces.clear();
        m_retire.clear();
        m_interop.reset();
        m_layerPipeline.reset();
        m_blitPipeline.reset();
        m_blitSrb.reset();
        m_blitUbuf.reset();
        m_canvasRt.reset();
        m_canvasRp.reset();
        m_canvas.reset();
        m_canvasSize = {};
        m_vbuf.reset();
        m_sampler.reset();
        m_vbufUploaded = false;
        m_rhi = rhi();
        m_effectStages = nt::registeredEffectStages();
        m_blendHandlers = nt::registeredBlendHandlers();
        m_matteStage = nt::registeredMatteStage();
    }
    if (!m_interop) {
        m_interop = nt::hw::PlatformInterop::create(m_rhi);
    }
    if (!m_vbuf) {
        m_vs = loadShader(QStringLiteral(":/shaders/composite.vert.qsb"));
        m_fs = loadShader(QStringLiteral(":/shaders/composite.frag.qsb"));
        m_vbuf.reset(m_rhi->newBuffer(QRhiBuffer::Immutable, QRhiBuffer::VertexBuffer, sizeof(kQuad)));
        if (!m_vbuf->create()) qFatal("vertex buffer create failed");
        m_sampler.reset(m_rhi->newSampler(QRhiSampler::Linear, QRhiSampler::Linear, QRhiSampler::None,
                                          QRhiSampler::ClampToEdge, QRhiSampler::ClampToEdge));
        if (!m_sampler->create()) qFatal("sampler create failed");
        m_blitUbuf.reset(m_rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(LayerUniforms)));
        if (!m_blitUbuf->create()) qFatal("uniform buffer create failed");
    }
    // The item's render target changes on resize; its pass descriptor stays
    // compatible, so the blit pipeline survives.
}

void PreviewCompositorRenderer::synchronize(QQuickRhiItem* rhiItem) {
    auto* item = static_cast<PreviewCompositor*>(rhiItem);
    // Hand the frames rendered since the last sync to the GUI side.
    item->m_framesRendered = m_frame;
    if (item->m_collectStats) {
        item->m_stats.insert(item->m_stats.end(), m_pendingStats.begin(), m_pendingStats.end());
    }
    m_pendingStats.clear();
    m_collectStats = item->m_collectStats;
    item->m_openDecoders = m_pool.openDecoders();
    if (!m_resourceError.empty() && item->m_renderError.isEmpty()) {
        item->m_renderError = QString::fromStdString(m_resourceError);
    }
    item->m_liveFrameRefs = nt::hw::FrameRef::live();
    item->m_renderThread = nt::cpu::currentThread();  // synchronize() runs on the render thread
    item->m_renderThreadQos = nt::cpu::currentThreadQos();
    {
        const long long version = m_pool.reportVersion();
        if (version != item->m_mediaReportVersion) {
            item->m_mediaReportVersion = version;
            item->m_mediaReport.clear();
            for (const auto& r : m_pool.report()) {
                item->m_mediaReport.push_back({QString::fromStdString(r.clipId), QString::fromStdString(r.mediaPath),
                                               r.ok, QString::fromStdString(r.reason),
                                               QString::fromStdString(r.decoder), QString::fromStdString(r.fallback)});
            }
        }
    }
    if (item->m_captureRequested) {
        m_captureWanted = true;
        m_captureImmediate = item->m_captureImmediate;
        item->m_captureRequested = false;
    }
    {
        std::lock_guard lock(m_captureMutex);
        if (!m_captured.isNull()) {
            item->m_capture = m_captured;
            item->m_captureTimeMs = m_capturedTimeMs;
            m_captured = QImage();
        }
    }

    m_layers.clear();
    m_precomposites.clear();
    m_playing = false;
    if (!item->m_timeline) {
        m_timeline.reset();
        return;
    }
    if (m_sourceModel != item->m_timeline || m_sourceGeneration != item->m_timeline->documentGeneration()) {
        for (auto it = m_sources.begin(); it != m_sources.end();) {
            if (it->second.registered) {
                retireSource(it->second);
                it = m_sources.erase(it);
            } else {
                ++it;
            }
        }
        m_sourceModel = item->m_timeline;
        m_sourceGeneration = item->m_timeline->documentGeneration();
    }
    m_timeline = item->m_timeline->snapshot();
    m_wantedCanvas = QSize(m_timeline->width, m_timeline->height);
    m_fps = m_timeline->fps;
    m_timeMs = item->m_clock ? item->m_clock->currentTimeMs() : 0.0;
    m_playing = item->m_clock && item->m_clock->playing();
    nt::SceneFrame scene = nt::evaluateScene(*m_timeline, m_timeMs);
    m_layers = std::move(scene.layers);
    m_precomposites = std::move(scene.precomposites);
}

std::unique_ptr<QRhiGraphicsPipeline> PreviewCompositorRenderer::makePipeline(QRhiRenderPassDescriptor* rp,
                                                                              bool blend) {
    std::unique_ptr<QRhiGraphicsPipeline> ps(m_rhi->newGraphicsPipeline());
    if (blend) {
        // Premultiplied alpha "over".
        QRhiGraphicsPipeline::TargetBlend b;
        b.enable = true;
        b.srcColor = QRhiGraphicsPipeline::One;
        b.dstColor = QRhiGraphicsPipeline::OneMinusSrcAlpha;
        b.srcAlpha = QRhiGraphicsPipeline::One;
        b.dstAlpha = QRhiGraphicsPipeline::OneMinusSrcAlpha;
        ps->setTargetBlends({b});
    }
    ps->setTopology(QRhiGraphicsPipeline::TriangleStrip);
    ps->setShaderStages({{QRhiShaderStage::Vertex, m_vs}, {QRhiShaderStage::Fragment, m_fs}});
    QRhiVertexInputLayout layout;
    layout.setBindings({{4 * sizeof(float)}});
    layout.setAttributes({{0, 0, QRhiVertexInputAttribute::Float2, 0},
                          {0, 1, QRhiVertexInputAttribute::Float2, 2 * sizeof(float)}});
    ps->setVertexInputLayout(layout);
    ps->setShaderResourceBindings(m_blitSrb.get());  // layout only; same bindings for every layer
    ps->setRenderPassDescriptor(rp);
    if (!ps->create()) {
        qFatal("pipeline create failed");
    }
    return ps;
}

void PreviewCompositorRenderer::ensureCanvas() {
    if (m_canvas && m_canvasSize == m_wantedCanvas) {
        return;
    }
    m_surfaces.clear();  // their targets use the canvas's pass descriptor
    m_layerPipeline.reset();
    m_canvasRt.reset();
    m_canvasRp.reset();
    m_canvasSize = m_wantedCanvas;
    // UsedAsTransferSource: stills read the canvas back (QRhi requires the flag).
    m_canvas.reset(m_rhi->newTexture(QRhiTexture::RGBA8, m_canvasSize, 1,
                                     QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    if (!m_canvas->create()) qFatal("canvas texture create failed");
    m_canvasRt.reset(m_rhi->newTextureRenderTarget({m_canvas.get()}));
    m_canvasRp.reset(m_canvasRt->newCompatibleRenderPassDescriptor());
    m_canvasRt->setRenderPassDescriptor(m_canvasRp.get());
    if (!m_canvasRt->create()) qFatal("canvas render target create failed");

    // The blit samples the canvas, so its bindings follow the canvas texture.
    m_blitSrb.reset(m_rhi->newShaderResourceBindings());
    m_blitSrb->setBindings({
        QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage |
                                                        QRhiShaderResourceBinding::FragmentStage,
                                                 m_blitUbuf.get()),
        QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, m_canvas.get(),
                                                  m_sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, m_canvas.get(),
                                                  m_sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, m_canvas.get(),
                                                  m_sampler.get()),
    });
    if (!m_blitSrb->create()) qFatal("canvas bindings create failed");
    m_canvasDrawn = false;
    m_layerPipeline = makePipeline(m_canvasRp.get(), true);
}

std::unique_ptr<PreviewCompositorRenderer::Surface> PreviewCompositorRenderer::makeSurface(QSize size) {
    // Test seam: every surface allocation fails (scripts/check-group-surfaces.mjs).
    static const bool failForTest = qEnvironmentVariableIsSet("NT_TEST_FAIL_SURFACES");
    if (failForTest) return nullptr;
    auto s = std::make_unique<Surface>();
    s->retire = &m_retire;
    s->frame = &m_frame;
    s->texture.reset(m_rhi->newTexture(QRhiTexture::RGBA8, size, 1,
                                     QRhiTexture::RenderTarget | QRhiTexture::UsedAsTransferSource));
    if (!s->texture->create()) return nullptr;
    s->rt.reset(m_rhi->newTextureRenderTarget({s->texture.get()}));
    // The canvas's pass descriptor: same single RGBA8 attachment, so the
    // layer pipeline draws into a surface as into the canvas.
    s->rt->setRenderPassDescriptor(m_canvasRp.get());
    if (!s->rt->create()) return nullptr;
    s->ubuf.reset(m_rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(LayerUniforms)));
    if (!s->ubuf->create()) return nullptr;
    s->srb.reset(m_rhi->newShaderResourceBindings());
    const auto stages = QRhiShaderResourceBinding::VertexStage | QRhiShaderResourceBinding::FragmentStage;
    s->srb->setBindings({
        QRhiShaderResourceBinding::uniformBuffer(0, stages, s->ubuf.get()),
        QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, s->texture.get(),
                                                  m_sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, s->texture.get(),
                                                  m_sampler.get()),
        QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, s->texture.get(),
                                                  m_sampler.get()),
    });
    if (!s->srb->create()) return nullptr;
    return s;
}

void PreviewCompositorRenderer::ensureBlitPipeline() {
    if (!m_blitPipeline) {
        m_blitPipeline = makePipeline(renderTarget()->renderPassDescriptor(), false);
    }
}

void PreviewCompositorRenderer::retireSource(SourceEntry& entry) {
    // Entries include bindings, uniforms and owned textures queued by this
    // frame, so keep the entire entry until that command buffer completes.
    m_retire.retire(std::make_shared<SourceEntry>(std::move(entry)), m_frame);
}

PreviewCompositorRenderer::SourceEntry& PreviewCompositorRenderer::entryFor(const nt::ActiveLayer& layer) {
    const auto key = std::pair{layer.clipId, layer.kind};
    auto it = m_sources.find(key);
    const auto registration = nt::registeredLayerSourceFactory(layer.kind);
    if (it != m_sources.end()) {
        if (it->second.factoryToken == registration.token &&
            (it->second.registered || bool(it->second.ownedSource) == layer.mediaPath.empty())) {
            return it->second;
        }
        retireSource(it->second);
        m_sources.erase(it);
    }
    SourceEntry e;
    e.factoryToken = registration.token;
    e.ownedSource = registration.factory ? registration.factory(layer) : nullptr;
    e.registered = bool(e.ownedSource);
    if (!e.ownedSource && layer.mediaPath.empty()) {
        e.ownedSource = std::make_unique<nt::SyntheticSource>(
            QString::fromStdString(layer.label), nt::SyntheticSource::colorForId(QString::fromStdString(layer.clipId)),
            QSize(layer.sourceWidth, layer.sourceHeight), m_fps);
    }
    e.ubuf.reset(m_rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(LayerUniforms)));
    e.ubufOk = e.ubuf->create();
    e.srb.reset(m_rhi->newShaderResourceBindings());
    return m_sources.emplace(key, std::move(e)).first->second;
}

void PreviewCompositorRenderer::render(QRhiCommandBuffer* cb) {
    const qint64 startNs = m_clock.nsecsElapsed();
    ++m_frame;

    ensureCanvas();
    ensureBlitPipeline();

    QRhiResourceUpdateBatch* updates = m_rhi->nextResourceUpdateBatch();
    if (!m_vbufUploaded) {
        updates->uploadStaticBuffer(m_vbuf.get(), kQuad);
        m_vbufUploaded = true;
    }

    // Matte sources are prepared independently and never enter the draw stack.
    std::vector<std::pair<const nt::ActiveLayer*, bool>> prepare;
    std::set<const nt::ActiveLayer*> matteSources;
    if (m_matteStage) {
        for (const auto& layer : m_layers) {
            if (layer.matte && layer.matte->layer && matteSources.insert(layer.matte->layer.get()).second) {
                prepare.emplace_back(layer.matte->layer.get(), true);
            }
        }
    }
    for (const auto& layer : m_layers) { prepare.emplace_back(&layer, false); }
    std::map<const nt::ActiveLayer*, std::map<std::string, std::string>> requestedSources;
    const auto providers = nt::registeredSecondSourceProviders();
    if (m_timeline) {
        std::optional<nt::Timeline> poolTimeline;
        const auto writableTimeline = [&]() -> nt::Timeline& {
            if (!poolTimeline) { poolTimeline = *m_timeline; }
            return *poolTimeline;
        };
        if (!providers.empty() || !matteSources.empty()) {
            std::map<std::string, const nt::Clip*> clips;
            std::set<std::string> usedIds;
            for (const auto& clip : m_timeline->clips) {
                clips.emplace(clip.id, &clip);
                usedIds.insert(clip.id);
            }
            std::map<std::pair<std::string, std::string>, std::string> derivedIds;
            for (const auto& [layer, matteSource] : prepare) {
                const auto found = clips.find(layer->clipId);
                if (found == clips.end()) { continue; }
                const auto& clip = *found->second;
                if (matteSource && clip.hidden && !layer->mediaPath.empty() && !entryFor(*layer).ownedSource) {
                    auto& copy = writableTimeline();
                    for (auto& candidate : copy.clips) {
                        if (candidate.id == clip.id) { candidate.hidden = false; break; }
                    }
                }
                std::map<std::string, std::string> requests;
                for (const auto& provider : providers) {
                    for (auto& request : provider(*layer, clip)) {
                        requests[request.key] = std::move(request.mediaPath);
                    }
                }
                for (const auto& [key, path] : requests) {
                    const auto identity = std::pair{clip.id, key};
                    auto [id, inserted] = derivedIds.try_emplace(identity);
                    if (inserted) {
                        // Check both document and derived ids, including unusual
                        // document ids containing the separator. Never alias a clip.
                        id->second = clip.id + '\x1f' + key;
                        while (usedIds.contains(id->second)) { id->second += '\x1f'; }
                        usedIds.insert(id->second);
                        auto second = clip;
                        second.id = id->second;
                        second.mediaPath = path;
                        second.hidden = false;
                        writableTimeline().clips.push_back(std::move(second));
                    }
                    requestedSources[layer][key] = id->second;
                }
            }
        }
        // No handler/request: pass the original document, with no copy.
        m_pool.update(poolTimeline ? *poolTimeline : *m_timeline, m_timeMs);
    } else {
        m_pool.update(nt::Timeline{}, 0.0);
    }

    if (m_interop) nt::hw::trackCompletion(cb, m_frame);
    // Release hardware frames no command buffer in flight can sample (D11).
    const int framesInFlight = m_rhi->resourceLimit(QRhi::FramesInFlight);
    m_retire.collect(m_frame, framesInFlight);
    if (m_interop) m_interop->flush();
    nt::FrameContext fctx;
    fctx.rhi = m_rhi;
    fctx.updates = updates;
    fctx.frameNumber = m_frame;
    fctx.retire = &m_retire;
    fctx.interop = m_interop.get();
    int cpuCopies = 0;
    // GPU resources this frame could not create: the frame is incomplete,
    // never exact, and the first reason is kept for the stills (F1).
    int resourceFailures = 0;
    const auto resourceFailed = [&](const std::string& what) {
        ++resourceFailures;
        if (m_resourceError.empty()) {
            m_resourceError = what;
            std::fprintf(stderr, "error: %s\n", what.c_str());
        }
    };
    int hardwareLayers = 0;
    const auto planEffects = [&](nt::LayerFrame input, const QJsonObject& ext,
                                 std::vector<EffectPass>& passes, QMargins& totalOutset,
                                 const std::map<std::string, nt::LayerFrame>* sources = nullptr) -> std::optional<nt::LayerFrame> {
        for (const auto& stage : m_effectStages) {
            if (!stage->applies(ext)) { continue; }
            const auto margin = stage->outset(ext, input.size);
            const qint64 width = qint64(input.size.width()) + margin.left() + margin.right();
            const qint64 height = qint64(input.size.height()) + margin.top() + margin.bottom();
            if (margin.left() < 0 || margin.top() < 0 || margin.right() < 0 || margin.bottom() < 0 ||
                width <= 0 || height <= 0 || width > std::numeric_limits<int>::max() ||
                height > std::numeric_limits<int>::max()) {
                resourceFailed("invalid effect outset");
                return {};
            }
            const QSize outputSize{int(width), int(height)};
            auto* output = m_surfaces.acquire(outputSize, m_frame);
            if (!output) {
                resourceFailed("cannot allocate an effect surface");
                return {};
            }
            passes.push_back({stage.get(), input, output, &ext, sources});
            input.format = nt::LayerFrame::Format::Rgba8Premultiplied;
            input.planes = {output->texture.get(), nullptr, nullptr};
            input.flipV = m_rhi->isYUpInFramebuffer();
            input.size = outputSize;
            totalOutset += margin;
        }
        return input;
    };
    const nt::EffectContext effectContext{m_rhi, cb, m_frame, &m_retire};
    const auto renderEffects = [&](const std::vector<EffectPass>& passes) {
        for (const auto& pass : passes) {
            auto context = effectContext;
            context.sources = pass.sources;
            if (!pass.stage->render(context, pass.input, *pass.output->rt, *pass.ext)) {
                resourceFailed("cannot render an effect stage");
            }
        }
    };
    std::vector<EffectPass> layerEffects;
    const auto bindFrame = [&](SourceEntry& e, const nt::LayerFrame& frame, const std::string& clipId) {
        e.lastUsedFrame = m_frame;
        if (!e.ubuf) {
            e.ubuf.reset(m_rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(LayerUniforms)));
            e.ubufOk = e.ubuf->create();
            e.srb.reset(m_rhi->newShaderResourceBindings());
        }
        std::array<QRhiTexture*, 3> planes = frame.planes;
        for (auto& p : planes) {
            if (!p) p = frame.planes[0];  // unused samplers still need a texture
        }
        if (!e.ubufOk) {
            resourceFailed("cannot create the uniform buffer of clip " + clipId);
            return false;
        }
        if (e.bound != planes) {
            e.srb->setBindings({
                QRhiShaderResourceBinding::uniformBuffer(0, QRhiShaderResourceBinding::VertexStage |
                                                                QRhiShaderResourceBinding::FragmentStage,
                                                         e.ubuf.get()),
                QRhiShaderResourceBinding::sampledTexture(1, QRhiShaderResourceBinding::FragmentStage, planes[0],
                                                          m_sampler.get()),
                QRhiShaderResourceBinding::sampledTexture(2, QRhiShaderResourceBinding::FragmentStage, planes[1],
                                                          m_sampler.get()),
                QRhiShaderResourceBinding::sampledTexture(3, QRhiShaderResourceBinding::FragmentStage, planes[2],
                                                          m_sampler.get()),
            });
            if (!e.srb->create()) {
                e.bound = {};
                resourceFailed("cannot create the bindings of clip " + clipId);
                return false;
            }
            e.bound = planes;
        }
        return true;
    };
    struct TexturePass { Surface* output; QRhiShaderResourceBindings* input; };
    std::vector<TexturePass> sourceConversions;
    std::map<const nt::ActiveLayer*, std::map<std::string, nt::LayerFrame>> secondSources;
    std::map<const nt::ActiveLayer*, QRhiShaderResourceBindings*> matteBindings;
    struct MattePass {
        const nt::ActiveLayer* layer;
        QRhiShaderResourceBindings* layerBindings;
        QRhiShaderResourceBindings* matteBindings;
        Surface* placedLayer;
        Surface* placedMatte;
        Surface* output;
        const std::map<std::string, nt::LayerFrame>* sources;
    };
    std::vector<MattePass> mattePasses;

    const QMatrix4x4 corr = m_rhi->clipSpaceCorrMatrix();
    // One item of a container's stack (D35): a layer or a group surface.
    struct Draw {
        QRhiShaderResourceBindings* srb;
        int z = 0;
        std::optional<int> stackOrder;
        std::string container;  // precomposeGroupId; empty: the frame
        const std::string* blendMode;
        const QJsonObject* ext;
    };
    std::vector<Draw> draws;
    draws.reserve(m_layers.size());
    int frameError = -1;
    int missing = 0;
    int cutMisses = 0;
    int mediaLayers = 0;
    int missingMedia = 0;
    bool allExact = true;
    const double frameMs = m_fps > 0 ? 1000.0 / m_fps : 1000.0 / 30.0;
    for (const auto& [layerPointer, isMatteSource] : prepare) {
        const nt::ActiveLayer& layer = *layerPointer;
        SourceEntry& e = entryFor(layer);
        e.lastUsedFrame = m_frame;
        nt::LayerSource* source = e.ownedSource ? e.ownedSource.get() : m_pool.sourceFor(layer.clipId);
        if (source) { source->updateLayer(layer); }
        nt::LayerFrame frame =
            source ? source->frameAt(fctx, layer.sourceTimeMs) : nt::LayerFrame{};
        cpuCopies += frame.cpuCopies;
        if (frame.hardware) ++hardwareLayers;
        if (!layer.mediaPath.empty()) ++mediaLayers;
        if (frame.format == nt::LayerFrame::Format::None || !frame.planes[0]) {
            // No frame yet (decoder opening or seeking): the layer is left out.
            ++missing;
            allExact = false;
            if (!layer.mediaPath.empty()) {
                ++missingMedia;
                if (layer.clipTimeMs < frameMs) ++cutMisses;
            }
            continue;
        }
        allExact = allExact && frame.exact;
        if (frame.ptsSec >= 0.0 && !frame.constantRate) {
            // Variable rate: the frame index is not pts x rate. The exact flag
            // says whether the shown frame is the D17 pick; otherwise the
            // picture is at least one frame behind (a lower bound).
            frameError = std::max(frameError, frame.exact ? 0 : 1);
        } else if (frame.ptsSec >= 0.0 && frame.frameRate > 0.0) {
            // Frame error: the shown frame against the D17 pick for this time.
            const double sourceSec = layer.sourceTimeMs / 1000.0;
            const long long expected =
                static_cast<long long>(std::floor((sourceSec + nt::kTimestampEpsilonSec) * frame.frameRate));
            long long expectedClamped = expected;
            if (frame.durationSec > 0.0) {
                const long long last = static_cast<long long>(std::ceil(frame.durationSec * frame.frameRate - 1e-6)) - 1;
                expectedClamped = std::min(expected, std::max(0LL, last));
            }
            const long long shown = std::llround(frame.ptsSec * frame.frameRate);
            const int error = static_cast<int>(std::llabs(expectedClamped - shown));
            frameError = std::max(frameError, error);
            if (error > 2 && qEnvironmentVariableIsSet("NT_DIAG_FRAME_ERROR")) {
                std::fprintf(stderr, "diag: frame %lld clip %s source %.3f s shows %.3f s (error %d, exact %d, hw %d)\n",
                             m_frame, layer.clipId.c_str(), sourceSec, frame.ptsSec, error, frame.exact, frame.hardware);
            }
        }
        const std::map<std::string, nt::LayerFrame>* layerSources = nullptr;
        if (const auto requested = requestedSources.find(&layer); requested != requestedSources.end()) {
            auto& frames = secondSources[&layer];
            bool ready = true;
            for (const auto& [key, id] : requested->second) {
                auto* second = m_pool.sourceFor(id);
                auto sourceFrame = second ? second->frameAt(fctx, layer.sourceTimeMs) : nt::LayerFrame{};
                cpuCopies += sourceFrame.cpuCopies;
                if (sourceFrame.hardware) { ++hardwareLayers; }
                ++mediaLayers;
                if (sourceFrame.format == nt::LayerFrame::Format::None || !sourceFrame.planes[0]) {
                    ++missing; ++missingMedia;
                    allExact = false;
                    ready = false;
                    continue;
                }
                allExact = allExact && sourceFrame.exact;
                if (sourceFrame.format != nt::LayerFrame::Format::Rgba8Premultiplied) {
                    auto* converted = m_surfaces.acquire(sourceFrame.size, m_frame);
                    auto& entry = m_sources[std::pair{id, std::string{}}];
                    if (!converted || !bindFrame(entry, sourceFrame, id)) {
                        if (!converted) { resourceFailed("cannot allocate a second-source conversion surface"); }
                        ready = false;
                        continue;
                    }
                    LayerUniforms u{};
                    writeMatrix(u, corr);
                    std::memcpy(u.colorMatrix, sourceFrame.colorMatrix.data(), sizeof(u.colorMatrix));
                    u.opacity = 1.0f;
                    u.flipV = sourceFrame.flipV ? 1.0f : 0.0f;
                    u.mode = modeFor(sourceFrame.format);
                    u.sourceTexelSize[0] = 1.0f / sourceFrame.size.width();
                    u.sourceTexelSize[1] = 1.0f / sourceFrame.size.height();
                    updates->updateDynamicBuffer(entry.ubuf.get(), 0, sizeof(u), &u);
                    sourceConversions.push_back({converted, entry.srb.get()});
                    sourceFrame.format = nt::LayerFrame::Format::Rgba8Premultiplied;
                    sourceFrame.planes = {converted->texture.get(), nullptr, nullptr};
                    sourceFrame.flipV = m_rhi->isYUpInFramebuffer();
                }
                frames.emplace(key, sourceFrame);
            }
            if (!ready) { continue; }
            layerSources = &frames;
        }
        const bool useMatte = !isMatteSource && m_matteStage && layer.matte && layer.matte->layer;
        if (useMatte && !matteBindings.contains(layer.matte->layer.get())) { continue; }
        const QSize originalSize = frame.size;
        QMargins outset;
        if (!m_effectStages.empty()) {
            const auto processed = planEffects(frame, layer.ext, layerEffects, outset, layerSources);
            if (!processed) { continue; }
            frame = *processed;
        }
        if (!bindFrame(e, frame, layer.clipId)) { continue; }
        // The cut geometry and the group's matrix included (DESIGN.md D35).
        const auto [sourceWidth, sourceHeight] = nt::croppedSourceSize(layer.sourceRect, originalSize.width(), originalSize.height());
        const auto m = nt::layerDrawMatrix(layer, sourceWidth, sourceHeight, m_canvasSize.width(),
                                           m_canvasSize.height());
        QMatrix4x4 model;
        std::copy(m.begin(), m.end(), model.data());
        if (!outset.isNull()) {
            // Expand in the original crop's local space, after contain fit
            // and transform. Input pixels keep their original placement.
            model.translate(float(outset.right() - outset.left()) / sourceWidth,
                            float(outset.top() - outset.bottom()) / sourceHeight);
            model.scale(float(qint64(sourceWidth) + outset.left() + outset.right()) / sourceWidth,
                        float(qint64(sourceHeight) + outset.top() + outset.bottom()) / sourceHeight);
        }
        LayerUniforms u{};
        writeMatrix(u, corr * model);
        std::memcpy(u.colorMatrix, frame.colorMatrix.data(), sizeof(u.colorMatrix));
        // Its own opacity: a group's opacity applies once, to its surface (D35).
        u.opacity = useMatte ? 1.0f : static_cast<float>(layer.opacity);
        u.flipV = frame.flipV ? 1.0f : 0.0f;
        std::copy(layer.sourceRect.begin(), layer.sourceRect.end(), u.sourceRect.begin());
        if (!outset.isNull()) {
            // The crop remains in original source coordinates. Include the
            // accumulated padding on both sides when sampling the grown frame.
            u.sourceRect = {layer.sourceRect[0] * originalSize.width() / frame.size.width(),
                            layer.sourceRect[1] * originalSize.height() / frame.size.height(),
                            (layer.sourceRect[2] * originalSize.width() + outset.left() + outset.right()) / frame.size.width(),
                            (layer.sourceRect[3] * originalSize.height() + outset.top() + outset.bottom()) / frame.size.height()};
        }
        u.sourceTexelSize[0] = 1.0f / frame.size.width();
        u.sourceTexelSize[1] = 1.0f / frame.size.height();
        u.mode = modeFor(frame.format);
        updates->updateDynamicBuffer(e.ubuf.get(), 0, sizeof(u), &u);
        if (isMatteSource) {
            matteBindings[&layer] = e.srb.get();
        } else if (useMatte) {
            auto* placedLayer = m_surfaces.acquire(m_canvasSize, m_frame);
            auto* placedMatte = m_surfaces.acquire(m_canvasSize, m_frame);
            auto* output = m_surfaces.acquire(m_canvasSize, m_frame);
            if (!placedLayer || !placedMatte || !output) {
                resourceFailed("cannot allocate matte surfaces");
                continue;
            }
            mattePasses.push_back({&layer, e.srb.get(), matteBindings.at(layer.matte->layer.get()),
                                   placedLayer, placedMatte, output, layerSources});
            LayerUniforms result{};
            writeMatrix(result, corr);
            result.opacity = static_cast<float>(layer.opacity);
            result.flipV = m_rhi->isYUpInFramebuffer() ? 1.0f : 0.0f;
            updates->updateDynamicBuffer(output->ubuf.get(), 0, sizeof(result), &result);
            draws.push_back({output->srb.get(), layer.z, layer.stackOrder, layer.precomposeGroupId, &layer.blendMode, &layer.ext});
        } else {
        draws.push_back({e.srb.get(), layer.z, layer.stackOrder, layer.precomposeGroupId, &layer.blendMode, &layer.ext});
        }
    }
    const int layerDraws = static_cast<int>(draws.size());

    // Intermediate surfaces (D35), innermost first: each drawn group gets a
    // pooled target and becomes one item of its own container.
    struct SurfacePass {
        Surface* surface;
        std::string groupId;
        std::vector<EffectPass> effects;
    };
    std::vector<SurfacePass> surfacePasses;
    const auto hasItems = [&](const std::string& groupId) {
        return std::any_of(draws.begin(), draws.end(), [&](const Draw& d) { return d.container == groupId; });
    };
    for (const nt::PrecompositeLayer& pc : m_precomposites) {
        if (!hasItems(pc.clipId)) continue;  // nothing drawn: no target
        Surface* surface = m_surfaces.acquire(m_canvasSize, m_frame);
        if (!surface) {
            // The group and everything in it are missing from this frame.
            resourceFailed("cannot allocate the surface of group " + pc.clipId);
            continue;
        }
        std::vector<EffectPass> effects;
        nt::LayerFrame input;
        input.format = nt::LayerFrame::Format::Rgba8Premultiplied;
        input.planes[0] = surface->texture.get();
        input.size = m_canvasSize;
        input.flipV = m_rhi->isYUpInFramebuffer();
        QMargins outset;
        if (!planEffects(input, pc.ext, effects, outset)) { continue; }
        Surface* composite = effects.empty() ? surface : effects.back().output;
        // Frame-sized, so only the group's cut moves it; its matrix already
        // rode into each child.
        nt::ActiveLayer placement;
        placement.transition = pc.transition;
        const auto m = nt::layerDrawMatrix(placement, m_canvasSize.width(), m_canvasSize.height(),
                                           m_canvasSize.width(), m_canvasSize.height());
        QMatrix4x4 model;
        std::copy(m.begin(), m.end(), model.data());
        if (!outset.isNull()) {
            model.translate(float(outset.right() - outset.left()) / m_canvasSize.width(),
                            float(outset.top() - outset.bottom()) / m_canvasSize.height());
            model.scale(float(qint64(m_canvasSize.width()) + outset.left() + outset.right()) / m_canvasSize.width(),
                        float(qint64(m_canvasSize.height()) + outset.top() + outset.bottom()) / m_canvasSize.height());
        }
        LayerUniforms u{};
        writeMatrix(u, corr * model);
        u.opacity = static_cast<float>(pc.opacity);
        u.flipV = !effects.empty() && m_rhi->isYUpInFramebuffer() ? 1.0f : 0.0f;
        u.mode = 0.0f;  // premultiplied RGBA
        updates->updateDynamicBuffer(composite->ubuf.get(), 0, sizeof(u), &u);
        surfacePasses.push_back({surface, pc.clipId, std::move(effects)});
        draws.push_back({composite->srb.get(), pc.z, pc.stackOrder, pc.precomposeGroupId, &pc.blendMode, &pc.ext});
    }
    // `sortStack`: by z, then stack order (absent last), stable.
    std::stable_sort(draws.begin(), draws.end(), [](const Draw& a, const Draw& b) {
        if (a.z != b.z) return a.z < b.z;
        const int sa = a.stackOrder.value_or(std::numeric_limits<int>::max());
        const int sb = b.stackOrder.value_or(std::numeric_limits<int>::max());
        return sa < sb;
    });

    // Present rules (D12): with layers in the plan and none drawn, keep the
    // last picture instead of a black frame (a cut onto a decoder still
    // opening). With no layers, the canvas is black: a real gap.
    const bool held = !m_layers.empty() && layerDraws == 0 && m_canvasDrawn;
    const QRhiCommandBuffer::VertexInput vin(m_vbuf.get(), 0);
    int blendSurfaces = 0;
    const auto beginContainerPass = [&](QRhiRenderTarget* rt, const QColor& clear, QRhiResourceUpdateBatch* batch) {
        cb->beginPass(rt, clear, {1.0f, 0}, batch);
        cb->setGraphicsPipeline(m_layerPipeline.get());
        cb->setViewport({0, 0, float(m_canvasSize.width()), float(m_canvasSize.height())});
    };
    const auto drawBindings = [&](QRhiShaderResourceBindings* srb) {
        cb->setShaderResources(srb);
        cb->setVertexInput(0, 1, &vin);
        cb->draw(4);
    };
    const auto surfaceFrame = [&](Surface* surface) {
        nt::LayerFrame frame;
        frame.format = nt::LayerFrame::Format::Rgba8Premultiplied;
        frame.planes[0] = surface->texture.get();
        frame.size = m_canvasSize;
        frame.flipV = m_rhi->isYUpInFramebuffer();
        return frame;
    };
    // Unhandled items stay in the original pass. Only a matching handler
    // splits the container, preserving its previous pixels as the backdrop.
    const auto drawContainer = [&](QRhiRenderTarget* rt, QRhiTexture* texture, const QColor& clear,
                                   const std::string& container, QRhiResourceUpdateBatch* batch) {
        beginContainerPass(rt, clear, batch);
        for (const Draw& d : draws) {
            if (d.container != container) { continue; }
            const auto handler = m_blendHandlers.find(*d.blendMode);
            if (*d.blendMode == "normal" || handler == m_blendHandlers.end()) {
                drawBindings(d.srb);
                continue;
            }
            auto* backdrop = m_surfaces.acquire(m_canvasSize, m_frame);
            auto* layer = m_surfaces.acquire(m_canvasSize, m_frame);
            auto* output = m_surfaces.acquire(m_canvasSize, m_frame);
            if (!backdrop || !layer || !output) {
                resourceFailed("cannot allocate blend surfaces");
                drawBindings(d.srb);
                continue;
            }
            cb->endPass();
            auto* copy = m_rhi->nextResourceUpdateBatch();
            copy->copyTexture(backdrop->texture.get(), texture);
            cb->resourceUpdate(copy);
            beginContainerPass(layer->rt.get(), Qt::transparent, nullptr);
            drawBindings(d.srb);
            cb->endPass();
            const bool ok = handler->second->render(effectContext, surfaceFrame(backdrop), surfaceFrame(layer),
                                                     *output->rt, *d.blendMode, *d.ext);
            if (!ok) { resourceFailed("cannot render a blend handler"); }
            // A handler writes the complete container. Copy it over a clear
            // target, then continue with later items. A failed handler falls
            // back to the saved backdrop and the original over draw.
            auto* result = ok ? output : backdrop;
            LayerUniforms u{};
            writeMatrix(u, corr);
            u.opacity = 1.0f;
            u.flipV = m_rhi->isYUpInFramebuffer() ? 1.0f : 0.0f;
            auto* resume = m_rhi->nextResourceUpdateBatch();
            resume->updateDynamicBuffer(result->ubuf.get(), 0, sizeof(u), &u);
            beginContainerPass(rt, Qt::transparent, resume);
            drawBindings(result->srb.get());
            if (!ok) { drawBindings(d.srb); }
            blendSurfaces += 3;
        }
        cb->endPass();
    };
    if (held) {
        cb->resourceUpdate(updates);
    } else {
        // Surfaces first, innermost first, over transparency; the first pass
        // carries the frame's uploads. Then the canvas.
        QRhiResourceUpdateBatch* batch = updates;
        if (!layerEffects.empty() || !sourceConversions.empty() || !mattePasses.empty()) {
            cb->resourceUpdate(batch);
            batch = nullptr;
            for (const auto& pass : sourceConversions) {
                beginContainerPass(pass.output->rt.get(), Qt::transparent, nullptr);
                cb->setViewport({0, 0, float(pass.output->texture->pixelSize().width()),
                                       float(pass.output->texture->pixelSize().height())});
                drawBindings(pass.input);
                cb->endPass();
            }
            renderEffects(layerEffects);
            for (const auto& pass : mattePasses) {
                beginContainerPass(pass.placedLayer->rt.get(), Qt::transparent, nullptr);
                drawBindings(pass.layerBindings);
                cb->endPass();
                beginContainerPass(pass.placedMatte->rt.get(), Qt::transparent, nullptr);
                drawBindings(pass.matteBindings);
                cb->endPass();
                auto context = effectContext;
                context.sources = pass.sources;
                if (!m_matteStage->render(context, surfaceFrame(pass.placedLayer), surfaceFrame(pass.placedMatte),
                                          *pass.output->rt, *pass.layer->matte, pass.layer->ext)) {
                    resourceFailed("cannot render a matte stage");
                }
            }
        }
        for (const SurfacePass& sp : surfacePasses) {
            drawContainer(sp.surface->rt.get(), sp.surface->texture.get(), QColor(0, 0, 0, 0), sp.groupId, batch);
            batch = nullptr;
            renderEffects(sp.effects);
        }
        drawContainer(m_canvasRt.get(), m_canvas.get(), QColor(0, 0, 0, 255), std::string(), batch);
        m_canvasDrawn = true;
    }
    int drawnSurfaces = held ? 0 : static_cast<int>(surfacePasses.size() + layerEffects.size() + sourceConversions.size() + 3 * mattePasses.size()) + blendSurfaces;
    if (!held) {
        for (const auto& pass : surfacePasses) { drawnSurfaces += static_cast<int>(pass.effects.size()); }
    }
    m_surfaces.endFrame(m_frame, m_canvasSize);

    // Stills: read the canvas back once every layer shows its exact frame.
    // An immediate capture takes this frame as it is (the first picture at a
    // cut during playback); a settled one waits for every exact frame.
    const bool settled = allExact && missing == 0 && !held && resourceFailures == 0;
    m_waitingForFrames = m_captureWanted && !m_captureImmediate && !settled;
    if (m_captureWanted && !m_captureInFlight && (m_captureImmediate || settled)) {
        m_captureWanted = false;
        const double captureTime = m_timeMs;
        m_captureInFlight = true;
        m_readback = QRhiReadbackResult();
        // OpenGL (the Linux default) reads a texture back bottom row first.
        m_readback.completed = [this, captureTime, flip = m_rhi->isYUpInFramebuffer()] {
            const QImage img(reinterpret_cast<const uchar*>(m_readback.data.constData()), m_readback.pixelSize.width(),
                             m_readback.pixelSize.height(), QImage::Format_RGBA8888_Premultiplied);
            std::lock_guard lock(m_captureMutex);
            m_captured = flip ? img.flipped(Qt::Vertical) : img.copy();
            m_capturedTimeMs = captureTime;
            m_captureInFlight = false;
        };
        QRhiResourceUpdateBatch* rb = m_rhi->nextResourceUpdateBatch();
        rb->readBackTexture({m_canvas.get()}, &m_readback);
        cb->resourceUpdate(rb);
    }

    // Pass 2: canvas letterboxed into the item.
    const QSize target = renderTarget()->pixelSize();
    const double canvasAspect = double(m_canvasSize.width()) / m_canvasSize.height();
    const double targetAspect = target.height() > 0 ? double(target.width()) / target.height() : canvasAspect;
    QMatrix4x4 fit;
    if (targetAspect > canvasAspect) {
        fit.scale(float(canvasAspect / targetAspect), 1.0f);
    } else {
        fit.scale(1.0f, float(targetAspect / canvasAspect));
    }
    LayerUniforms blit{};
    writeMatrix(blit, corr * fit);
    blit.opacity = 1.0f;
    // A Y-up framebuffer (OpenGL) stores the canvas bottom row first.
    blit.flipV = m_rhi->isYUpInFramebuffer() ? 1.0f : 0.0f;
    QRhiResourceUpdateBatch* blitUpdates = m_rhi->nextResourceUpdateBatch();
    blitUpdates->updateDynamicBuffer(m_blitUbuf.get(), 0, sizeof(blit), &blit);
    cb->beginPass(renderTarget(), QColor(10, 10, 12, 255), {1.0f, 0}, blitUpdates);
    cb->setGraphicsPipeline(m_blitPipeline.get());
    cb->setViewport({0, 0, float(target.width()), float(target.height())});
    cb->setShaderResources(m_blitSrb.get());
    cb->setVertexInput(0, 1, &vin);
    cb->draw(4);
    cb->endPass();

    // Evict sources whose clips have not drawn for a while.
    for (auto it = m_sources.begin(); it != m_sources.end();) {
        if (m_frame - it->second.lastUsedFrame > kEvictAfterFrames) {
            retireSource(it->second);
            it = m_sources.erase(it);
        } else {
            ++it;
        }
    }

    FrameStat stat;
    stat.startNs = m_steadyOriginNs + startNs;
    stat.intervalMs = m_lastRenderNs < 0 ? 0.0 : double(startNs - m_lastRenderNs) / 1.0e6;
    stat.renderCpuMs = double(m_clock.nsecsElapsed() - startNs) / 1.0e6;
    const double gpuSec = cb->lastCompletedGpuTime();
    stat.windowGpuObservationMs = gpuSec > 0.0 ? gpuSec * 1000.0 : -1.0;
    stat.layers = layerDraws;
    stat.surfaces = drawnSurfaces;
    stat.surfaceTargets = m_surfaces.size();
    stat.surfaceTargetsCreated = m_surfaces.created();
    stat.framesInFlight = m_rhi->resourceLimit(QRhi::FramesInFlight);
    stat.frameError = frameError;
    stat.held = held;
    stat.missingLayers = missing;
    stat.cutMisses = cutMisses;
    stat.mediaLayers = mediaLayers;
    stat.cpuCopies = cpuCopies;
    stat.hardwareLayers = hardwareLayers;
    stat.liveFrameRefs = nt::hw::FrameRef::live();
    stat.allExact = allExact && missing == 0 && resourceFailures == 0;
    stat.resourceFailures = resourceFailures;
    stat.surfaceBytes = static_cast<long long>(m_surfaces.bytes());
    stat.surfaceOverBudget = m_surfaces.lastFrameOverBudget();
    if (stat.surfaceOverBudget && !m_warnedOverBudget) {
        m_warnedOverBudget = true;
        std::fprintf(stderr, "warning: group surfaces need more than the %zu MiB budget in one frame\n",
                     m_surfaces.budgetBytes() / (1024 * 1024));
    }
    stat.missingMediaLayers = missingMedia;
    stat.timeMs = m_timeMs;
    stat.openDecoders = m_pool.openDecoders();
    if (m_collectStats) {
        m_pendingStats.push_back(stat);
    }
    m_lastRenderNs = startNs;

    if (m_playing || m_waitingForFrames || m_captureInFlight || missing > 0 || !allExact || !m_retire.empty()) {
        update();  // next frame at vsync; also while decoders catch up
    }
}
