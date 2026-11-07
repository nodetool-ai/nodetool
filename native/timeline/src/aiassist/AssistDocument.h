#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <QStringList>
#include <optional>
namespace nt::aiassist {
// Resource prefixes resolve only against the caller's already authorized scope.
std::optional<QString> resolveId(const QString& input, const QStringList& authorized);
QJsonObject correctTranscript(QJsonObject document, const QJsonObject& payload);
QJsonObject deleteTranscriptRange(QJsonObject document, const QJsonObject& payload);
QJsonObject removeFillers(QJsonObject document, const QJsonObject& payload);
QJsonArray transcript(const QJsonObject& document);
// A deferred result is valid only for the exact document snapshot it observed.
bool acceptsResult(const QJsonObject& observed, const QJsonObject& current);
}
