#pragma once

#include <QImage>
#include <QQuickRhiItem>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

#include <vector>
#include <functional>
#include <memory>
#include <cstdint>

class QJsonObject;
class QRhiTextureRenderTarget;
namespace nt {
struct EffectContext;
struct LayerFrame;
struct SceneAdjustment;
class BackdropStage {
public:
    virtual ~BackdropStage() = default;
    virtual bool applies(const QJsonObject& ext) const = 0;
    // Full-surface premultiplied input, read-only and distinct from output.
    // Write the complete replacement in framebuffer orientation. Retire every
    // GPU resource through the context until its last use.
    virtual bool render(const EffectContext&, const LayerFrame& accumulation, QRhiTextureRenderTarget& output,
                        const SceneAdjustment&) = 0;
};
using BackdropStageToken = std::uint64_t;
using BackdropStageFactory = std::function<std::unique_ptr<BackdropStage>()>;
BackdropStageToken registerBackdropStage(BackdropStageFactory factory);
void unregisterBackdropStage(BackdropStageToken token);
// Each renderer owns a snapshot, in registration order, taken at QRhi initialization.
std::vector<std::unique_ptr<BackdropStage>> registeredBackdropStages();
}

class TimelineModel;
class PlaybackClock;

// One composited frame, measured on the render thread.
struct FrameStat {
    qint64 startNs = 0;        // render() start, std::chrono::steady_clock
    double intervalMs = 0.0;   // since the previous render() start
    double renderCpuMs = 0.0;  // render() body: uploads plus command recording
    // The latest whole-window GPU time Qt had when this frame was recorded:
    // QRhiCommandBuffer::lastCompletedGpuTime() in ms, or negative when it was
    // 0. It covers the window's command buffer (QML too), belongs to an earlier
    // frame, and can repeat. It is an observation, not this frame's GPU time.
    double windowGpuObservationMs = -1.0;
    int layers = 0;
    int framesInFlight = 1;    // QRhi::FramesInFlight: how stale a GPU time can be
    // Media correctness, per frame (DESIGN.md D12, PLAN M1b exit 1 and 2):
    int frameError = -1;       // largest |shown - expected| frame index over the
                               // media layers with a known rate; -1 when none
    bool held = false;         // layers in the plan, none drew: last picture kept
    int missingLayers = 0;     // layers in the plan without a frame
    int cutMisses = 0;         // media layers on their first frame with no picture
    int openDecoders = 0;
    int mediaLayers = 0;        // layers in the plan with media
    int missingMediaLayers = 0; // of those, layers with no picture
    double timeMs = 0.0;        // the clock time this frame showed
    int cpuCopies = 0;          // planes uploaded from CPU memory this frame
    int hardwareLayers = 0;     // layers drawn from imported decoder surfaces
    int liveFrameRefs = 0;      // hardware FrameRefs alive (process-wide)
    bool allExact = false;      // every layer showed its exact frame (D22 readiness)
    // Intermediate surfaces (D35): drawn this frame, render targets in the
    // pool after it, and targets created since the renderer started.
    int surfaces = 0;
    int surfaceTargets = 0;
    long long surfaceTargetsCreated = 0;
    long long surfaceBytes = 0;      // bytes of the targets in the pool after this frame
    bool surfaceOverBudget = false;  // this frame alone needed more than the pool budget
    // GPU resources this frame needed and could not create (a surface, a
    // layer's uniform buffer or bindings). Such a frame is never exact.
    int resourceFailures = 0;
};

struct MediaReportEntry {
    QString clipId;
    QString mediaPath;
    bool ok = false;
    QString reason;
    QString decoder;
    QString fallback;
};

// The GPU preview. Every frame it takes the SceneEval layer list at the clock
// time (synchronize), composites it into a canvas-sized offscreen texture, and
// draws that texture letterboxed into the item (render).
class PreviewCompositor : public QQuickRhiItem {
    Q_OBJECT
    QML_ELEMENT
    Q_PROPERTY(TimelineModel* timeline READ timeline WRITE setTimeline NOTIFY timelineChanged)
    Q_PROPERTY(PlaybackClock* clock READ clock WRITE setClock NOTIFY clockChanged)

public:
    explicit PreviewCompositor(QQuickItem* parent = nullptr);

    TimelineModel* timeline() const { return m_timeline; }
    void setTimeline(TimelineModel* timeline);
    PlaybackClock* clock() const { return m_clock; }
    void setClock(PlaybackClock* clock);

    // Per-frame stats are kept only while collection is on (the bench), so
    // normal playback does not grow memory. GUI thread.
    void setCollectFrameStats(bool on) { m_collectStats = on; }
    const std::vector<FrameStat>& frameStats() const { return m_stats; }
    // Frames rendered so far, always counted. GUI thread.
    long long framesRendered() const { return m_framesRendered; }
    // Decoders open at the last frame. GUI thread.
    int openDecoders() const { return m_openDecoders; }
    // The render thread, for its CPU time (nt::cpu::threadNs); 0 before the
    // first frame. GUI thread.
    unsigned renderThread() const { return m_renderThread; }
    const char* renderThreadQos() const { return m_renderThreadQos; }
    // Hardware FrameRefs alive at the last frame. GUI thread.
    int liveFrameRefs() const { return m_liveFrameRefs; }
    // The loader report: one entry per media clip opened so far. GUI thread.
    const std::vector<MediaReportEntry>& mediaReport() const { return m_mediaReport; }
    // The first GPU resource the renderer could not create (a group surface,
    // a layer's buffer or bindings), or empty. A frame missing a resource is
    // never exact, so a still cannot settle on it. GUI thread.
    QString renderError() const { return m_renderError; }

    // Stills: asks for a read-back of the canvas once every layer shows its
    // exact frame for the current time. takeCapture() returns it once ready.
    // With `immediate`, the next rendered frame is read back as it is, exact
    // or not (the first picture at a cut during playback).
    // A new request replaces the last one, whose read-back is then dropped.
    void requestCapture(bool immediate = false) {
        m_captureRequested = true;
        m_captureImmediate = immediate;
        ++m_captureRequest;
        m_capture = QImage();
    }
    bool captureReady() const { return !m_capture.isNull(); }
    // The clock time of the frame the last capture shows.
    double captureTimeMs() const { return m_captureTimeMs; }
    QImage takeCapture() { QImage out = m_capture; m_capture = QImage(); return out; }

signals:
    void timelineChanged();
    void clockChanged();

protected:
    QQuickRhiItemRenderer* createRenderer() override;

private:
    friend class PreviewCompositorRenderer;

    TimelineModel* m_timeline = nullptr;
    PlaybackClock* m_clock = nullptr;
    bool m_collectStats = false;
    std::vector<FrameStat> m_stats;  // written in synchronize(), GUI thread blocked
    long long m_framesRendered = 0;  // written in synchronize(), GUI thread blocked
    int m_openDecoders = 0;
    int m_liveFrameRefs = 0;
    unsigned m_renderThread = 0;
    const char* m_renderThreadQos = "unknown";
    std::vector<MediaReportEntry> m_mediaReport;
    QString m_renderError;
    long long m_mediaReportVersion = -1;
    bool m_captureRequested = false;
    bool m_captureImmediate = false;
    quint64 m_captureRequest = 0;
    double m_captureTimeMs = 0.0;
    QImage m_capture;
};
