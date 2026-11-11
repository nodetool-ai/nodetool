#pragma once

// The scripted scrub (PLAN M1d): paused seeks and scrubs driven on the
// offscreen path, measured headless. It needs a function that renders one
// frame, the compositor (frame stats and captures) and the clock.

#include <QJsonObject>
#include <QString>

#include <functional>

class PlaybackClock;
class PreviewCompositor;

namespace nt::bench {

struct ScrubContext {
    std::function<void()> renderFrame;  // renders one offscreen frame
    PreviewCompositor* compositor = nullptr;
    PlaybackClock* clock = nullptr;
    double fps = 30.0;
    double durationMs = 0.0;
    QString fixture;
    QString decode;
    QString outDir;  // final stills of each scrub
};

// Runs `script` (JSON, see README § Scrub) and returns the report. On a
// script error, the report has "error" set.
QJsonObject runScrubScript(const ScrubContext& ctx, const QJsonObject& script);

}  // namespace nt::bench
