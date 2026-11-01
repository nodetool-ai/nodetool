#pragma once
#include <QJsonObject>
#include <QString>
namespace nt::aiassist {
struct VoicePlan {
    QString error;
    QJsonObject request;
    QJsonObject line;
    QJsonObject voice;
    QString scriptId;
};
VoicePlan planScriptVoice(const QJsonObject& script, const QString& lineId);
QJsonObject scriptVoiceTake(const VoicePlan& plan, const QString& assetId, double durationMs,
                           const QJsonObject& transcription, const QString& id, const QString& createdAt,
                           const QJsonObject& generation);
QJsonObject appendScriptTake(QJsonObject script, const QString& lineId, const QJsonObject& take);
}
