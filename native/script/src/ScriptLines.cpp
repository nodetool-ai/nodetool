#include "ScriptLines.h"
#include "ScriptAuthoring.h"

QVariantList ScriptLines::rows(const QVariantMap& script) const {
    return nt::script::scriptPanelRows(QJsonObject::fromVariantMap(script)).toVariantList();
}
QVariantMap ScriptLines::setLineText(const QVariantMap& script, const QString& lineId, const QString& text) const {
    return nt::script::patchScriptLineText(QJsonObject::fromVariantMap(script), {{"lineId", lineId}, {"text", text}}).toVariantMap();
}
QVariantMap ScriptLines::addLine(const QVariantMap& script) const {
    return nt::script::addScriptLine(QJsonObject::fromVariantMap(script)).toVariantMap();
}
