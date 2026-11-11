#pragma once
#include <QJsonArray>
#include <QJsonObject>
namespace nt::aiassist {
QJsonArray assistantTools();
QJsonObject assistantPlanningEdit(const QString &name, QJsonObject raw,
                                  const QJsonObject &payload);
QJsonObject assistantValidateProduction(const QJsonValue &input);
QJsonObject assistantCompileProduction(const QJsonObject &input);
QString assistantFingerprint(const QJsonObject &value);
QJsonObject assistantPrepareBeatCut(QJsonObject raw,
                                    const QJsonObject &options);
QJsonObject assistantDirectorRequest(const QJsonObject &raw, bool replan,
                                     const QString &provider,
                                     const QString &model);
QJsonArray assistantDirectorBeats(const QJsonObject &raw,
                                  const QJsonObject &result);
QJsonObject assistantEdit(const QString &name, QJsonObject raw,
                          const QJsonObject &payload);
} // namespace nt::aiassist
