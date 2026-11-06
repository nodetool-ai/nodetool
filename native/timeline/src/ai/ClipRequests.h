#pragma once
#include <QJsonObject>
#include <QString>

namespace nt::ai {
struct ClipRequestResult {
    QJsonObject snapshot;
    QJsonObject data;
    QString error;
    bool ok() const { return error.isEmpty(); }
};
ClipRequestResult mediaEditRequest(const QString& sequenceId, const QJsonObject& clip, const QJsonObject& options);
ClipRequestResult extensionRequest(const QString& sequenceId, const QString& requestId, const QJsonObject& clip,
                                   const QJsonObject& model, const QJsonObject& options);
ClipRequestResult imageToVideoRequest(const QString& sequenceId, const QJsonObject& sourceClip,
                                     const QJsonObject& model, const QJsonObject& options);
ClipRequestResult lineDeliveryRequest(const QJsonObject& input);
}
