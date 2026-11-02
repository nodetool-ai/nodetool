#pragma once
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
    explicit OffscreenFrames(TimelineModel& model);
    ~OffscreenFrames();
    OffscreenFrames(const OffscreenFrames&) = delete;
    OffscreenFrames& operator=(const OffscreenFrames&) = delete;
    QImage captureAt(double timeMs, const std::function<bool()>& cancelled);
    QImage capture(qint64 index, double fps, const std::function<bool()>& cancelled);
private:
    struct Impl;
    std::unique_ptr<Impl> m_impl;
};
}
