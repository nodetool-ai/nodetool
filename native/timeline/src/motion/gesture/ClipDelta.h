#pragma once
#include <QJsonArray>
#include <QJsonObject>
namespace nt::motion {
QJsonObject rebaseDocumentDelta(const QJsonObject& base, const QJsonObject& before, const QJsonObject& after);
QJsonArray rebaseClipDelta(const QJsonArray& base, const QJsonArray& before, const QJsonArray& after);
}
