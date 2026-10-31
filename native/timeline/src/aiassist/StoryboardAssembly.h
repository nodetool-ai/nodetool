#pragma once
#include <QJsonObject>
#include <QJsonArray>
namespace nt::aiassist {
struct StoryboardAssemblyResult {
    QJsonObject document;
    QString error;
    QJsonArray skippedShotIds;
    QJsonArray skippedLineIds;
    QJsonArray trimmedShots;
    QJsonArray retimedShots;
};
StoryboardAssemblyResult assembleStoryboard(const QJsonObject& existing, const QJsonObject& boardResponse,
                                           const QJsonObject& scriptResponse = {});
}
