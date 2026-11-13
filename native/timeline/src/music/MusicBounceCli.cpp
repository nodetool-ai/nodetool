// `nodetool-timeline <fixture.json> --music-bounce OUT.wav --kind mix|dry
//  --track ID --start-frame N --frames N`: one context bounce window written
// as a 48 kHz stereo float WAV (docs/MUSIC-MODE.md section 14.3, MM5 exits 3
// and 4). Prints {"frames", "kind", "trackId", "startFrame", "problems",
// "peak"} as JSON. Exit 0 on success, 1 when a voice had no PCM or the file
// could not be written, 2 on bad arguments.

#include "app/CliModes.h"
#include "assets/AssetWav.h"
#include "music/MusicBounce.h"
#include "server/ServerSource.h"

#include <QCommandLineParser>
#include <QCoreApplication>
#include <QJsonArray>
#include <QJsonDocument>
#include <QJsonObject>

#include <algorithm>
#include <cmath>
#include <cstdio>

namespace {

int musicBounceCli(int argc, char** argv) {
    QCoreApplication app(argc, argv);
    QCommandLineParser parser;
    parser.addPositionalArgument(QStringLiteral("fixture"), QStringLiteral("Timeline JSON file"));
    const QCommandLineOption outOpt(QStringLiteral("music-bounce"), QStringLiteral("Float WAV output"),
                                    QStringLiteral("FILE"));
    const QCommandLineOption kindOpt(QStringLiteral("kind"), QStringLiteral("mix or dry"), QStringLiteral("KIND"),
                                     QStringLiteral("mix"));
    const QCommandLineOption trackOpt(QStringLiteral("track"), QStringLiteral("Target track id"), QStringLiteral("ID"));
    const QCommandLineOption startOpt(QStringLiteral("start-frame"), QStringLiteral("Window start, 48 kHz frames"),
                                      QStringLiteral("N"), QStringLiteral("0"));
    const QCommandLineOption framesOpt(QStringLiteral("frames"), QStringLiteral("Window length, 48 kHz frames"),
                                       QStringLiteral("N"));
    parser.addOptions({outOpt, kindOpt, trackOpt, startOpt, framesOpt});
    parser.process(app);
    const auto kind = parser.value(kindOpt);
    bool startOk = false;
    bool framesOk = false;
    const auto startFrame = parser.value(startOpt).toLongLong(&startOk);
    const auto frames = parser.value(framesOpt).toLongLong(&framesOk);
    if (parser.positionalArguments().size() != 1 || parser.value(outOpt).isEmpty() || !parser.isSet(trackOpt) ||
        (kind != u"mix" && kind != u"dry") || !startOk || startFrame < 0 || !framesOk || frames <= 0) {
        std::fprintf(stderr,
                     "usage: nodetool-timeline <fixture.json> --music-bounce OUT.wav --kind mix|dry --track ID "
                     "--start-frame N --frames N\n");
        return 2;
    }
    const auto loaded = nt::server::loadTimelineSource(parser.positionalArguments().first());
    if (!loaded.timeline) {
        std::fprintf(stderr, "error: %s\n", qPrintable(loaded.error));
        return 1;
    }
    const auto track = parser.value(trackOpt).toStdString();
    std::vector<std::string> problems;
    const auto pcm = nt::music::renderBounce(*loaded.timeline,
                                             kind == u"mix" ? nt::music::BounceKind::Mix : nt::music::BounceKind::Dry,
                                             track, startFrame, frames, &problems);
    if (pcm.empty() || !nt::assets::writeStereoFloatWav(parser.value(outOpt), pcm)) {
        std::fprintf(stderr, "error: cannot write %s\n", qPrintable(parser.value(outOpt)));
        return 1;
    }
    QJsonArray lines;
    for (const auto& line : problems) {
        lines.append(QString::fromStdString(line));
    }
    double peak = 0.0;
    for (const float sample : pcm) {
        peak = std::max(peak, static_cast<double>(std::abs(sample)));
    }
    const QJsonObject report{{"frames", static_cast<qint64>(pcm.size() / 2)},
                             {"kind", kind},
                             {"trackId", parser.value(trackOpt)},
                             {"startFrame", static_cast<qint64>(startFrame)},
                             {"problems", lines},
                             {"peak", peak}};
    std::printf("%s\n", QJsonDocument(report).toJson(QJsonDocument::Compact).constData());
    std::fflush(stdout);
    return problems.empty() ? 0 : 1;
}

const bool registered = nt::app::registerCliMode({QStringLiteral("--music-bounce"), musicBounceCli});

}  // namespace
