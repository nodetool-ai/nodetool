#pragma once
#include "model/TimelineTypes.h"
#include <QImage>
#include <QString>
#include <functional>
#include <stop_token>

namespace nt::exporting {
struct Options {
    QString output;
    QString format = QStringLiteral("mp4");
    bool alpha = false;
    QString videoEncoder;
    QString audioEncoder;
};
struct Progress {
    QString phase;
    qint64 frame = 0;
    qint64 totalFrames = 0;
    double ratio = 0;
};
struct Result {
    QString error;
    bool cancelled = false;
    qint64 frames = 0;
    qint64 samples = 0;
    double fps = 0;
    QString videoEncoder;
    QString audioEncoder;
    bool ok() const { return error.isEmpty() && !cancelled; }
};
using ProgressCallback = std::function<void(const Progress&)>;
using CancelProbe = std::function<bool()>;
bool mp4Available();
// Runs on the owning Qt GUI/QRhi thread. The editor controller launches a
// separate process so neither mixing nor encoder work blocks the editor.
Result exportTimeline(const Timeline& timeline, const Options& options, std::stop_token stop = {},
                      ProgressCallback progress = {}, CancelProbe cancel = {});
}
