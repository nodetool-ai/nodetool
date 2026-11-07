#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <QUrl>
namespace nt::aiassist {
// Document editing retains the full script response for CAS saving.
QJsonObject addScriptLine(QJsonObject script, const QJsonObject& payload = {});
QJsonObject patchScriptLineText(QJsonObject script, const QJsonObject& payload);
QJsonObject removeEmptyScriptLine(QJsonObject script, const QJsonObject& payload);
// Flat section-heading and line rows, with the web panel's speaker runs, status and focus target.
QJsonObject scriptPanelHeader(const QJsonObject& script);
QUrl scriptEditorUrl(const QUrl& server, const QString& scriptId);
QJsonArray scriptPanelRows(const QJsonObject& script, const QJsonObject& timeline = {});
}
