#include "export/OffscreenFrames.h"
#include "model/TimelineJson.h"
#include "model/TimelineModel.h"

#include <QGuiApplication>
#include <QFile>
#include <QElapsedTimer>
#include <cstdio>
#include <exception>

int main(int argc, char** argv) {
    QGuiApplication app(argc, argv);
    const auto args = app.arguments();
    if (args.size() != 3) {
        std::fprintf(stderr, "usage: capture-integration <sequence.json> <frame.png>\n");
        return 2;
    }
    QFile source(args[1]);
    if (!source.open(QIODevice::ReadOnly)) return 1;
    const auto before = source.readAll();
    auto parsed = nt::parseTimelineJson(before);
    if (!parsed.timeline) return 1;
    const double fps = parsed.timeline->fps;
    TimelineModel model;
    model.setTimeline(std::move(*parsed.timeline));
    try {
        nt::exporting::OffscreenFrames frames(model);
        QElapsedTimer timer;
        timer.start();
        const QImage image = frames.capture(48, fps, [] { return false; });
        if (image.isNull() || !image.save(args[2])) return 1;
        nt::Timeline small;
        small.width = 64;
        small.height = 64;
        small.fps = 30;
        small.durationMs = 1000;
        TimelineModel smallModel;
        smallModel.setTimeline(std::move(small));
        nt::exporting::OffscreenFrames smallFrames(smallModel);
        int probes = 0;
        const QImage cancelled = smallFrames.capture(0, 30, [&probes] { return ++probes >= 2; });
        if (!cancelled.isNull() || probes < 2) return 1;
        QFile verify(args[1]);
        if (!verify.open(QIODevice::ReadOnly) || verify.readAll() != before) return 1;
        std::fprintf(stderr, "capture frame 48: %lld ms\n", static_cast<long long>(timer.elapsed()));
    } catch (const std::exception& error) {
        std::fprintf(stderr, "capture failed: %s\n", error.what());
        return 1;
    }
    return 0;
}
