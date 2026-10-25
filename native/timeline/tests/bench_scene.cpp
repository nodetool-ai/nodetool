// Scene evaluation cost per frame (not a ctest): evaluateScene over every
// frame of a timeline file at 30 fps, twice; prints the median ms per frame
// of the second pass and the frame count.
//
// Usage: build-m5/bench_scene <timeline.json>

#include "model/TimelineJson.h"
#include "preview/SceneEval.h"

#include <QCoreApplication>

#include <algorithm>
#include <chrono>
#include <cstdio>
#include <vector>

int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    if (argc != 2) {
        std::fprintf(stderr, "usage: bench_scene <timeline.json>\n");
        return 2;
    }
    const auto loaded = nt::loadTimelineFile(QString::fromLocal8Bit(argv[1]));
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    // A revision, as TimelineModel gives a document: the flex layout cache
    // applies, as in the app.
    nt::Timeline tl = *loaded.timeline;
    tl.revision = nt::nextTimelineRevision();
    std::vector<double> ms;
    size_t layers = 0;
    for (int pass = 0; pass < 2; ++pass) {
        ms.clear();
        for (double t = 0; t < tl.durationMs; t += 1000.0 / 30.0) {
            const auto start = std::chrono::steady_clock::now();
            layers += nt::evaluateScene(tl, t).layers.size();
            ms.push_back(std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now() - start).count());
        }
    }
    std::sort(ms.begin(), ms.end());
    std::printf("{\"frames\":%zu,\"medianMs\":%.4f,\"p95Ms\":%.4f,\"layers\":%zu}\n", ms.size(), ms[ms.size() / 2],
                ms[ms.size() * 95 / 100], layers);
    return 0;
}
