#pragma once
#include "model/TimelineTypes.h"
#include "preview/WorkingFormat.h"
#include <QImage>
#include <QString>
#include <QSize>
#include <functional>
#include <stop_token>

namespace nt::exporting {
// After a cancel request the export process exits within this time.
inline constexpr int kCancelStopBudgetMs = 3000;
QImage fitFrame(const QImage& frame, QSize target, const QString& scaleMode);
struct Options {
    QString output;
    QString format = QStringLiteral("mp4");
    bool alpha = false;
    QString videoEncoder;
    QString audioEncoder;
    QString stagingDirectory;  // editor-owned, retained until the child exits
    double startMs = 0;
    double endMs = -1;
    int width = 0;
    int height = 0;
    double fps = 0;
    int videoBitrateKbps = 0;
    QString scaleMode = QStringLiteral("fit");
    std::function<void(const QByteArray&)> videoFrameForTest = {}; // packed YUV420P, before encoding
    std::function<void(const QImage&)> floatCanvasForTest = {}; // straight FP32, before resize
    nt::WorkingFormat workingFormat = nt::WorkingFormat::Rgba8; // internal test selection only
    int audioBitDepth = 16;  // WAV only: 16 or 24, both rounded without dither
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
    int width = 0;
    int height = 0;
    double startMs = 0;
    double endMs = 0;
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
