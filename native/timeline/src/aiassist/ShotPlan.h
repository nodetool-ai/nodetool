#pragma once
#include <QJsonObject>
#include <QJsonArray>
#include <optional>
namespace nt::aiassist {
struct ShotRenderPlan { QJsonObject request; QJsonObject renderInputs; QJsonObject shot; QJsonArray requests; QJsonArray productionCandidates; QString shotId; QString error; };
QJsonArray shotEntityLibrary(const QJsonArray& assets);
std::optional<double> linkedShotRenderSeconds(const QJsonObject& shot, const QJsonObject& script);
ShotRenderPlan planShotRender(const QJsonObject& board, const QString& shotId, const QString& kind, const QJsonObject& model, const QJsonArray& entityLibrary = {}, std::optional<double> linkedDurationSeconds = std::nullopt);
QJsonObject appendShotCandidate(QJsonObject board, const QString& shotId, const QString& kind, const QJsonObject& candidate);
QJsonObject acceptShotCandidate(QJsonObject board, const QString& shotId, const QString& kind, int index);
bool shotClipEditable(const QJsonObject& timeline, const QString& clipId);
QJsonObject linkShot(QJsonObject timeline, const QJsonObject& input);
QJsonObject insertDerivedClip(QJsonObject timeline, const QJsonObject& input);
QJsonObject deriveShot(QJsonObject board, const QJsonObject& sourceClip, const QJsonArray& references, const QString& action, const QString& newShotId);
}
