#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <QSet>
#include <QString>

namespace nt::ai {
struct ExtensionResult {
    QJsonArray clips;
    QString code;
    QString error;
    bool ok() const { return error.isEmpty(); }
};
ExtensionResult applyExtension(const QJsonArray& clips, const QJsonObject& source, const QString& takeId,
                               const QString& direction, double addedSourceDurationMs, const QString& timing,
                               const QSet<QString>& lockedTrackIds = {});
}
