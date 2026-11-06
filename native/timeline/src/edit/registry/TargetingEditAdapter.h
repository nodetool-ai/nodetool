#pragma once
#include <QJsonObject>
#include <QString>

namespace nt::edit::registry {
QJsonObject applyTargetingEdit(const QString& action, QJsonObject raw, const QJsonObject& payload);
} // namespace nt::edit::registry
