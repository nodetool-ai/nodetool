// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#include "export/ExportSettings.h"
#include <algorithm>
#include <cmath>

namespace nt::exporting {
QVariantMap toVariant(const Settings& settings) {
    return {{"format", settings.format}, {"alpha", settings.alpha}, {"startMs", settings.startMs},
        {"endMs", settings.endMs}, {"width", settings.width}, {"height", settings.height},
        {"fps", settings.fps}, {"videoBitrateKbps", settings.videoBitrateKbps}, {"scaleMode", settings.scaleMode},
        {"audioBitDepth", settings.audioBitDepth}};
}
Settings settingsFromVariant(const QVariantMap& values) {
    Settings settings;
    const auto format = values.value("format", settings.format).toString();
    if (QStringList({"mp4", "webm", "png_sequence", "wav", "mp3"}).contains(format)) {
        settings.format = format;
    }
    const auto nonnegative = [&](const char* key, double fallback) {
        const double value = values.value(key, fallback).toDouble();
        return std::isfinite(value) && value >= 0 ? value : fallback;
    };
    settings.alpha = values.value("alpha", settings.alpha).toBool();
    settings.startMs = nonnegative("startMs", 0);
    settings.endMs = nonnegative("endMs", -1);
    settings.width = std::max(0, values.value("width").toInt());
    settings.height = std::max(0, values.value("height").toInt());
    settings.fps = nonnegative("fps", 0);
    settings.videoBitrateKbps = std::max(0, values.value("videoBitrateKbps").toInt());
    if (values.value("audioBitDepth").toInt() == 24) { settings.audioBitDepth = 24; }
    if (values.value("scaleMode").toString() == u"fill") { settings.scaleMode = QStringLiteral("fill"); }
    return settings;
}
QStringList cliArguments(const Settings& settings) {
    QStringList args{"--format", settings.format};
    const auto number = [&](const char* flag, double value) {
        args.append(QString::fromLatin1(flag));
        args.append(QString::number(value, 'g', 16));
    };
    if (settings.startMs != 0) { number("--start-ms", settings.startMs); }
    if (settings.endMs >= 0) { number("--end-ms", settings.endMs); }
    if (settings.width != 0) { number("--width", settings.width); }
    if (settings.height != 0) { number("--height", settings.height); }
    if (settings.fps != 0) { number("--fps", settings.fps); }
    if (settings.videoBitrateKbps != 0) { number("--video-bitrate", settings.videoBitrateKbps); }
    if (settings.scaleMode != u"fit") { args.append({"--scale-mode", settings.scaleMode}); }
    if (settings.format == u"wav" && settings.audioBitDepth == 24) { args.append({"--audio-bit-depth", "24"}); }
    if (settings.alpha) { args.append("--alpha"); }
    return args;
}
QString fileExtension(const QString& format) {
    return format == u"png_sequence" ? QStringLiteral("zip") : format;
}
QString formatLabel(const QString& format) {
    if (format == u"webm") { return QStringLiteral("WebM (VP9)"); }
    if (format == u"png_sequence") { return QStringLiteral("PNG sequence (.zip)"); }
    if (format == u"wav") { return QStringLiteral("WAV audio"); }
    if (format == u"mp3") { return QStringLiteral("MP3 audio"); }
    return QStringLiteral("MP4 (H.264)");
}
bool isAudioOnly(const QString& format) { return format == u"wav" || format == u"mp3"; }
}
