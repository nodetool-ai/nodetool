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
};
QVariantMap toVariant(const Settings& settings);
Settings settingsFromVariant(const QVariantMap& values);
QStringList cliArguments(const Settings& settings);
QString fileExtension(const QString& format);
QString formatLabel(const QString& format);
bool isAudioOnly(const QString& format);
}
