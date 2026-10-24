#pragma once

#include <QImage>
#include <QQuickRhiItem>
#include <QString>
#include <QtQmlIntegration/qqmlintegration.h>

#include <vector>

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
};

struct MediaReportEntry {
    QString clipId;
    QString mediaPath;
    bool ok = false;
    QString reason;
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
    // The loader report: one entry per media clip opened so far. GUI thread.
    const std::vector<MediaReportEntry>& mediaReport() const { return m_mediaReport; }

    // Stills: asks for a read-back of the canvas once every layer shows its
    // exact frame for the current time. takeCapture() returns it once ready.
    // With `immediate`, the next rendered frame is read back as it is, exact
    // or not (the first picture at a cut during playback).
    void requestCapture(bool immediate = false) {
        m_captureRequested = true;
        m_captureImmediate = immediate;
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
    std::vector<MediaReportEntry> m_mediaReport;
    bool m_captureRequested = false;
    bool m_captureImmediate = false;
    double m_captureTimeMs = 0.0;
    QImage m_capture;
};
