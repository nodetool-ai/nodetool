#pragma once
#include <QJsonArray>
#include <QJsonObject>
#include <functional>
namespace nt::aiassist {
struct ScriptExtractionContext {
    std::function<QString(const QString&)> id;
    QString createdAt;
};
QJsonObject extractScriptFromTimeline(const QJsonArray& clips, const ScriptExtractionContext& context);
QJsonObject extractScriptFromTimeline(const QJsonArray& clips);
}
