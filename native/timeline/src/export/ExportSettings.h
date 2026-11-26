// Behaviour follows FilmCraft (https://github.com/storytold/filmcraft), crates/ui-egui/src/panels/export_mode, MIT. See licenses/FilmCraft-MIT.txt.
#pragma once
#include <QString>
#include <QStringList>
#include <QVariantMap>

namespace nt::exporting {
struct Settings {
    QString format = QStringLiteral("mp4");
    bool alpha = false;
    double startMs = 0;
    double endMs = -1;
    int width = 0;
    int height = 0;
    double fps = 0;
    int videoBitrateKbps = 0;
    QString scaleMode = QStringLiteral("fit");
    // PCM depth of a WAV export: 16, 24, or 32 (IEEE 754 float). Other formats ignore it.
    int audioBitDepth = 16;
    // Output audio sample rate in Hz (44100, 48000, 88200, 96000, or 192000).
    int audioSampleRate = 48000;
};
QVariantMap toVariant(const Settings& settings);
Settings settingsFromVariant(const QVariantMap& values);
QStringList cliArguments(const Settings& settings);
QString fileExtension(const QString& format);
QString formatLabel(const QString& format);
bool isAudioOnly(const QString& format);
bool isSupportedAudioSampleRate(const QString& format, int rate);
QString supportedAudioSampleRatesLabel(const QString& format);
}
