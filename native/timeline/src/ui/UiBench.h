#pragma once

// `--ui-bench` (PLAN.md M2 exit 1): plays the preview and drives the tracks
// region through a scripted zoom and pan (trackpad pinch steps, horizontal
// and vertical swipes, Ctrl-wheel steps), then prints one JSON line with the
// GUI-thread frame time.
//
// Offscreen (the default): a QQuickRenderControl on the QRhi, no window, no
// vsync. The GUI thread runs every stage, so each stage is reported:
// `inputMs` (the synthetic events), `polishMs` (bindings, the view state's
// flush, the clip and row windows), `syncMs` and `renderMs`. `guiMs` is
// input + polish + sync: the GUI thread's share of a frame in a threaded
// render loop, where the render stage runs on the render thread.
//
// `--ui-window`: the same script in a real window (threaded render loop,
// vsync). `guiMs` is the time from `afterAnimating` (GUI thread) to the end
// of `afterSynchronizing` (the GUI thread is blocked until then), plus the
// input; `frameIntervalMs` is between `frameSwapped` signals. It shows a
// window, so only scripts/window-checks.sh runs it.

#include <QSize>
#include <QString>

class TimelineModel;
class PlaybackClock;

namespace nt::ui {

struct UiBenchOptions {
    QString fixture;
    QSize size{1920, 1080};
    int frames = 600;
    int warmup = 30;
    bool windowed = false;
    // Fails the run when guiMs.p95 is at or over this; <= 0 means no budget.
    double guiP95BudgetMs = 0.0;
};

int runUiBench(TimelineModel& model, PlaybackClock& clock, const UiBenchOptions& options);

}  // namespace nt::ui
