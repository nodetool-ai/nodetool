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

#include <rhi/qrhi.h>

#include <QElapsedTimer>
#include <QFile>
#include <QMatrix4x4>
#include <QPointer>
#include <QQuickWindow>

#include <algorithm>
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
#include <unordered_map>

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
    float sourceRect[4]{0, 0, 1, 1};
    float sourceTexelSize[4]{};
};
static_assert(offsetof(LayerUniforms, sourceRect) == 144);
static_assert(offsetof(LayerUniforms, sourceTexelSize) == 160);
static_assert(sizeof(LayerUniforms) == 176);

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
        // D11: the renderer has no release hook, so its destructor drains
        // the retire queue. The sources go first (their displayed hardware
        // frames retire into the queue), then the GPU finishes every command
        // buffer that may sample them: Qt's Metal command buffers do not
        // retain the textures they use. Only then is the queue released.
        m_sources.clear();
        m_effectStages.clear();
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
        std::string kind;
        long long lastUsedFrame = 0;
    };

    // One pooled intermediate surface (D35): a canvas-sized target the
    // group's children draw into, and the bindings and uniforms that draw it
    // as one layer of its container.
    struct Surface {
        std::unique_ptr<QRhiTexture> texture;
        std::unique_ptr<QRhiTextureRenderTarget> rt;
        std::unique_ptr<QRhiBuffer> ubuf;
        std::unique_ptr<QRhiShaderResourceBindings> srb;
    };
    struct EffectPass {
        nt::LayerEffectStage* stage;
        nt::LayerFrame input;
        Surface* output;
        const QJsonObject* ext;
    };
    std::vector<std::unique_ptr<nt::LayerEffectStage>> m_effectStages;
    std::unique_ptr<Surface> makeSurface(QSize size);

    void ensureCanvas();
    void ensureBlitPipeline();
    SourceEntry& entryFor(const nt::ActiveLayer& layer);
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
    std::unordered_map<std::string, SourceEntry> m_sources;
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
        std::erase_if(m_sources, [](const auto& entry) { return entry.second.registered; });
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
    s->texture.reset(m_rhi->newTexture(QRhiTexture::RGBA8, size, 1, QRhiTexture::RenderTarget));
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

PreviewCompositorRenderer::SourceEntry& PreviewCompositorRenderer::entryFor(const nt::ActiveLayer& layer) {
    auto it = m_sources.find(layer.clipId);
    std::unique_ptr<nt::LayerSource> owned;
    bool checked = false;
    if (it != m_sources.end()) {
        if (it->second.kind == layer.kind) { return it->second; }
        owned = nt::registeredLayerSource(layer);
        checked = true;
        if (!it->second.registered && !owned) {
            it->second.kind = layer.kind;
            return it->second;
        }
        m_sources.erase(it);
    }
    SourceEntry e;
    e.kind = layer.kind;
    e.ownedSource = checked ? std::move(owned) : nt::registeredLayerSource(layer);
    e.registered = bool(e.ownedSource);
    if (!e.ownedSource && layer.mediaPath.empty()) {
        e.ownedSource = std::make_unique<nt::SyntheticSource>(
            QString::fromStdString(layer.label), nt::SyntheticSource::colorForId(QString::fromStdString(layer.clipId)),
            QSize(layer.sourceWidth, layer.sourceHeight), m_fps);
    }
    e.ubuf.reset(m_rhi->newBuffer(QRhiBuffer::Dynamic, QRhiBuffer::UniformBuffer, sizeof(LayerUniforms)));
    e.ubufOk = e.ubuf->create();
    e.srb.reset(m_rhi->newShaderResourceBindings());
    return m_sources.emplace(layer.clipId, std::move(e)).first->second;
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

    // Open, pre-roll and close decoders for this time (D18).
    if (m_timeline) {
        m_pool.update(*m_timeline, m_timeMs);
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
                                 std::vector<EffectPass>& passes) -> std::optional<nt::LayerFrame> {
        for (const auto& stage : m_effectStages) {
            if (!stage->applies(ext)) { continue; }
            auto* output = m_surfaces.acquire(input.size, m_frame);
            if (!output) {
                resourceFailed("cannot allocate an effect surface");
                return {};
            }
            passes.push_back({stage.get(), input, output, &ext});
            input.format = nt::LayerFrame::Format::Rgba8Premultiplied;
            input.planes = {output->texture.get(), nullptr, nullptr};
            input.flipV = m_rhi->isYUpInFramebuffer();
        }
        return input;
    };
    const nt::EffectContext effectContext{m_rhi, cb, m_frame, &m_retire};
    const auto renderEffects = [&](const std::vector<EffectPass>& passes) {
        for (const auto& pass : passes) {
            if (!pass.stage->render(effectContext, pass.input, *pass.output->rt, *pass.ext)) {
                resourceFailed("cannot render an effect stage");
            }
        }
    };
    std::vector<EffectPass> layerEffects;

    const QMatrix4x4 corr = m_rhi->clipSpaceCorrMatrix();
    // One item of a container's stack (D35): a layer or a group surface.
    struct Draw {
        QRhiShaderResourceBindings* srb;
        int z = 0;
        std::optional<int> stackOrder;
        std::string container;  // precomposeGroupId; empty: the frame
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
    for (const nt::ActiveLayer& layer : m_layers) {
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
        if (!m_effectStages.empty()) {
            const auto processed = planEffects(frame, layer.ext, layerEffects);
            if (!processed) { continue; }
            frame = *processed;
        }
        std::array<QRhiTexture*, 3> planes = frame.planes;
        for (auto& p : planes) {
            if (!p) p = frame.planes[0];  // unused samplers still need a texture
        }
        if (!e.ubufOk) {
            resourceFailed("cannot create the uniform buffer of clip " + layer.clipId);
            continue;
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
                resourceFailed("cannot create the bindings of clip " + layer.clipId);
                continue;
            }
            e.bound = planes;
        }
        // The cut geometry and the group's matrix included (DESIGN.md D35).
        const auto [sourceWidth, sourceHeight] = nt::croppedSourceSize(layer.sourceRect, frame.size.width(), frame.size.height());
        const auto m = nt::layerDrawMatrix(layer, sourceWidth, sourceHeight, m_canvasSize.width(),
                                           m_canvasSize.height());
        QMatrix4x4 model;
        std::copy(m.begin(), m.end(), model.data());
        LayerUniforms u{};
        writeMatrix(u, corr * model);
        std::memcpy(u.colorMatrix, frame.colorMatrix.data(), sizeof(u.colorMatrix));
        // Its own opacity: a group's opacity applies once, to its surface (D35).
        u.opacity = static_cast<float>(layer.opacity);
        u.flipV = frame.flipV ? 1.0f : 0.0f;
        std::copy(layer.sourceRect.begin(), layer.sourceRect.end(), u.sourceRect);
        u.sourceTexelSize[0] = 1.0f / frame.size.width();
        u.sourceTexelSize[1] = 1.0f / frame.size.height();
        u.mode = modeFor(frame.format);
        updates->updateDynamicBuffer(e.ubuf.get(), 0, sizeof(u), &u);
        draws.push_back({e.srb.get(), layer.z, layer.stackOrder, layer.precomposeGroupId});
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
        if (!planEffects(input, pc.ext, effects)) { continue; }
        Surface* composite = effects.empty() ? surface : effects.back().output;
        // Frame-sized, so only the group's cut moves it; its matrix already
        // rode into each child.
        nt::ActiveLayer placement;
        placement.transition = pc.transition;
        const auto m = nt::layerDrawMatrix(placement, m_canvasSize.width(), m_canvasSize.height(),
                                           m_canvasSize.width(), m_canvasSize.height());
        QMatrix4x4 model;
        std::copy(m.begin(), m.end(), model.data());
        LayerUniforms u{};
        writeMatrix(u, corr * model);
        u.opacity = static_cast<float>(pc.opacity);
        u.flipV = !effects.empty() && m_rhi->isYUpInFramebuffer() ? 1.0f : 0.0f;
        u.mode = 0.0f;  // premultiplied RGBA
        updates->updateDynamicBuffer(composite->ubuf.get(), 0, sizeof(u), &u);
        surfacePasses.push_back({surface, pc.clipId, std::move(effects)});
        draws.push_back({composite->srb.get(), pc.z, pc.stackOrder, pc.precomposeGroupId});
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
    // One pass per container: its items bottom to top.
    const auto drawContainer = [&](QRhiRenderTarget* rt, const QColor& clear, const std::string& container,
                                   QRhiResourceUpdateBatch* batch) {
        cb->beginPass(rt, clear, {1.0f, 0}, batch);
        cb->setGraphicsPipeline(m_layerPipeline.get());
        cb->setViewport({0, 0, float(m_canvasSize.width()), float(m_canvasSize.height())});
        for (const Draw& d : draws) {
            if (d.container != container) continue;
            cb->setShaderResources(d.srb);
            cb->setVertexInput(0, 1, &vin);
            cb->draw(4);
        }
        cb->endPass();
    };
    if (held) {
        cb->resourceUpdate(updates);
    } else {
        // Surfaces first, innermost first, over transparency; the first pass
        // carries the frame's uploads. Then the canvas.
        QRhiResourceUpdateBatch* batch = updates;
        if (!layerEffects.empty()) {
            cb->resourceUpdate(batch);
            batch = nullptr;
            renderEffects(layerEffects);
        }
        for (const SurfacePass& sp : surfacePasses) {
            drawContainer(sp.surface->rt.get(), QColor(0, 0, 0, 0), sp.groupId, batch);
            batch = nullptr;
            renderEffects(sp.effects);
        }
        drawContainer(m_canvasRt.get(), QColor(0, 0, 0, 255), std::string(), batch);
        m_canvasDrawn = true;
    }
    int drawnSurfaces = held ? 0 : static_cast<int>(surfacePasses.size() + layerEffects.size());
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
