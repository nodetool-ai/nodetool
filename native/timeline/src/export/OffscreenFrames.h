#pragma once
#include "preview/WorkingFormat.h"
#include <QImage>
#include <QString>
#include <functional>
#include <memory>
class TimelineModel;
namespace nt { struct Timeline; }
namespace nt::exporting {
nt::Timeline pictureTimeline(const nt::Timeline& timeline);
class OffscreenFrames {
public:
    explicit OffscreenFrames(TimelineModel& model, nt::WorkingFormat format = nt::WorkingFormat::Rgba8);
    ~OffscreenFrames();
    OffscreenFrames(const OffscreenFrames&) = delete;
    OffscreenFrames& operator=(const OffscreenFrames&) = delete;
    // Owned premultiplied canvas samples, without output conversion or dithering.
    QImage captureWorkingAt(double timeMs, const std::function<bool()>& cancelled);
    // Straight RGBA at the route's precision. RGBA8 retains its legacy conversion.
    QImage captureAt(double timeMs, const std::function<bool()>& cancelled);
    QImage capture(qint64 index, double fps, const std::function<bool()>& cancelled);
private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
}
