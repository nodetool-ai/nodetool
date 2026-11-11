#pragma once

#include <QJsonObject>
#include <QString>

namespace nt::ai {
struct TakeResult {
    QJsonObject clip;
    QString error;
};

// Apply a successful take to the existing editorial cut.
TakeResult applyTake(const QJsonObject& clip, const QString& takeId);
TakeResult renameTake(const QJsonObject& clip, const QString& takeId, const QString& label);
TakeResult deleteTake(const QJsonObject& clip, const QString& takeId);
}
