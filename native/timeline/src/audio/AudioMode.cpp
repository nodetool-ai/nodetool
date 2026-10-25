#include "audio/AudioMode.h"

#include <QSet>

namespace nt::audio {

QString resolveAudioMode(const QCommandLineParser& parser) {
    if (parser.isSet(QStringLiteral("audio"))) return parser.value(QStringLiteral("audio"));
    static const QSet<QString> interactive{
        QStringLiteral("size"),   QStringLiteral("seek"),    QStringLiteral("play"),
        QStringLiteral("decode"), QStringLiteral("decoder"), QStringLiteral("on-top"),
        QStringLiteral("audio-latency-ms"), QStringLiteral("audio-report"), QStringLiteral("audio-dry-run")};
    for (const QString& name : parser.optionNames()) {
        if (!interactive.contains(name)) return QStringLiteral("none");
    }
    return QStringLiteral("system");
}

}  // namespace nt::audio
