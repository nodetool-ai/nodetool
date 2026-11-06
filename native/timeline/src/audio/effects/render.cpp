#include "audio/AudioEngine.h"
#include "model/TimelineJson.h"
#include <QCoreApplication>
#include <QFile>
#include <QDebug>
#include <bit>
#include <span>

// File-only runner. Uses the same renderOffline and mixBlock as AudioCli.
int main(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    const auto args = app.arguments();
    if (args.size() != 4) { return 2; }
    const auto parsed = nt::loadTimelineFile(args[1]);
    if (!parsed.timeline) { qCritical() << parsed.error; return 1; }
    std::vector<std::string> problems;
    const auto pcm = nt::audio::renderOffline(*parsed.timeline, args[3].toInt(), 0,
                                            parsed.timeline->durationMs, &problems);
    if (!problems.empty()) { qCritical() << QString::fromStdString(problems[0]); return 1; }
    QFile file(args[2]);
    if (!file.open(QIODevice::WriteOnly)) { return 1; }
    // Object representation access, not type punning.
    const auto bytes = std::as_bytes(std::span(pcm));
    const auto* data = std::bit_cast<const char*>(bytes.data());
    return file.write(data, static_cast<qint64>(bytes.size())) == static_cast<qint64>(bytes.size()) ? 0 : 1;
}
