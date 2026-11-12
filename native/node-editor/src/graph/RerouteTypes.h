#pragma once
#include <QHash>
#include <QJsonArray>
#include <QString>
namespace nodetool {
struct ForwardDisplayTypes {
  QHash<QString, QString> sources;
  QHash<QString, QString> rerouteHandles;
};
QString displayPortKey(const QString &node, const QString &handle);
bool forwardDisplayInput(const QString &nodeType, const QString &handle);
ForwardDisplayTypes resolveForwardDisplayTypes(const QJsonArray &nodes,
                                               const QJsonArray &edges,
                                               const QJsonArray &catalog);
}
