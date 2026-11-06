#pragma once
#include <QJsonObject>

namespace nt::edit::transitions {
// Raw-document edits. Type changes include the cut resize in the same result.
QJsonObject setClipTransition(QJsonObject document, const QJsonObject& payload);
QJsonObject setTransitionDuration(QJsonObject document, const QJsonObject& payload);
QJsonObject removeTransition(QJsonObject document, const QJsonObject& payload);
}
